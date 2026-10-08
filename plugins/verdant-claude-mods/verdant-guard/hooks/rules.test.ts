import { describe, expect, test } from "claude-code/testing";

import { checkBash, checkFileEdit, checkInWarning, checkMcp, repoRelative } from "./rules";

// Built from a constant so scripts/check-bun-lockfile-policy.mjs, which scans tracked files for
// literal npm package-install commands, does not read these fixtures as lockfile consumers.
const NPM = "npm";

describe("checkBash — denies", () => {
  const denied = [
    "git push --force origin claude/x",
    "git push -f",
    "git push --force-with-lease origin claude/x",
    "git push origin +claude/x",
    "git push origin verdant-grow-diary",
    "git push -u origin HEAD:main",
    "git push origin HEAD:refs/heads/verdant-grow-diary",
    "cd repo && git -C . push origin main",
    "git push --no-verify -u origin claude/x",
    "git rebase origin/verdant-grow-diary",
    "git pull --rebase origin verdant-grow-diary",
    "git commit --no-verify -m wip",
    `${NPM} install left-pad`,
    "npm i -D vitest@3",
    "yarn add zod",
    "pnpm install",
    "bun add zod",
    "bun remove zod",
    "bun install --frozen-lockfile",
    "E2E_BASE_URL=http://127.0.0.1:8080 bunx playwright test --project=chromium-mocked",
    "npx playwright test --project chromium-mocked --reporter=dot",
    "supabase db push",
    "supabase functions deploy ai-doctor-review",
    "supabase migration repair --status applied 2026",
    "vercel --prod",
    "vercel promote https://x.vercel.app",
    "gh pr merge 1800 --squash",
    "gh pr ready 1800",
    "psql postgresql://postgres@db.knkwiiywfkbqznbxwqfh.supabase.co/postgres -c 'select 1'",
  ];
  for (const cmd of denied) {
    test(cmd, () => {
      expect(checkBash(cmd)).not.toBe(null);
    });
  }
});

describe("checkBash — allows", () => {
  const allowed = [
    "git push -u origin claude/happy-cray-yeazfk",
    "git push origin claude/main-fix",
    "git merge origin/verdant-grow-diary",
    "git rebase --abort",
    "git commit -m 'docs: x (#1)'",
    "git log --oneline -5 main",
    `printf 'registry=https://registry.npmjs.org/\\n' > .npmrc.tmp && npm_config_userconfig=$PWD/.npmrc.tmp ${NPM} install --no-audit --no-fund`,
    `${NPM} ci`,
    "bun run typecheck",
    "bunx vitest run src/test/x.test.ts --reporter=dot",
    "E2E_BASE_URL=http://127.0.0.1:8080 bunx playwright test --project=chromium-mocked e2e/auth-loading.spec.ts",
    "supabase db reset",
    "vercel ls",
    "gh pr view 1800",
    "grep -n 'git push --force' AGENTS.md",
  ];
  for (const cmd of allowed) {
    test(cmd, () => {
      expect(checkBash(cmd)).toBe(null);
    });
  }
});

describe("checkFileEdit", () => {
  test("generated files are refused", () => {
    expect(checkFileEdit("/home/u/repo/src/routeTree.gen.ts")).not.toBe(null);
    expect(checkFileEdit("/home/u/repo/src/integrations/supabase/types.ts")).not.toBe(null);
    expect(checkFileEdit("/home/u/repo/supabase/functions/mcp/index.ts")).not.toBe(null);
    expect(checkFileEdit("/home/u/repo/supabase/functions/_shared/lib/x.ts")).not.toBe(null);
  });
  test("lockfiles are refused", () => {
    expect(checkFileEdit("/home/u/repo/bun.lock")).not.toBe(null);
    expect(checkFileEdit("/home/u/repo/package-lock.json")).not.toBe(null);
  });
  test("ordinary files pass", () => {
    expect(checkFileEdit("/home/u/repo/src/lib/vpdRules.ts")).toBe(null);
    expect(checkFileEdit("/home/u/repo/docs/architecture.md")).toBe(null);
    expect(checkFileEdit("/home/u/repo/supabase/migrations/20990101000000_new.sql")).toBe(null);
  });
});

describe("checkMcp", () => {
  test("merge, production and un-drafting are refused", () => {
    expect(checkMcp("mcp__github__merge_pull_request", {})).not.toBe(null);
    expect(checkMcp("mcp__Supabase__execute_sql", { query: "select 1" })).not.toBe(null);
    expect(checkMcp("mcp__Vercel__request_promote", {})).not.toBe(null);
    expect(checkMcp("mcp__github__update_pull_request", { draft: false })).not.toBe(null);
  });
  test("reads and draft PRs pass", () => {
    expect(checkMcp("mcp__github__pull_request_read", {})).toBe(null);
    expect(checkMcp("mcp__github__create_pull_request", { draft: true })).toBe(null);
    expect(checkMcp("mcp__github__update_pull_request", { title: "x" })).toBe(null);
  });
});

describe("checkInWarning", () => {
  test("61-minute check-in warns, 55 and 240 do not", () => {
    expect(checkInWarning("mcp__claude-code-remote__send_later", { delay_minutes: 61 })).not.toBe(
      null,
    );
    expect(checkInWarning("mcp__claude-code-remote__send_later", { delay_minutes: 55 })).toBe(null);
    expect(checkInWarning("mcp__claude-code-remote__send_later", { delay_minutes: 240 })).toBe(
      null,
    );
  });
});

describe("heredocs", () => {
  test("a heredoc body written to a file or a script is data, not commands", () => {
    // The false positive this fixes: an edit script whose text named a forbidden command.
    const pyScript = `python3 - <<'PY'\ns=s.replace('    "${NPM} install left-pad",', 'x')\nPY`;
    expect(checkBash(pyScript)).toBe(null);
    const fileWrite = `cat > notes.md <<EOF\ngit push origin main\nEOF\ngit status`;
    expect(checkBash(fileWrite)).toBe(null);
  });
  test("commands after the heredoc are still checked", () => {
    expect(checkBash(`cat > f <<'EOF'\nhello\nEOF\ngit push --force`)).not.toBe(null);
  });
  test("a heredoc fed to a shell is checked line by line", () => {
    expect(checkBash(`bash <<'EOF'\ngit push --force origin claude/x\nEOF`)).not.toBe(null);
    expect(checkBash(`cd repo && bash -s <<EOF\ngit rebase origin/main\nEOF`)).not.toBe(null);
  });
  test("a here-string is not mistaken for a heredoc", () => {
    expect(checkBash(`grep x <<< "y"\ngit push --force`)).not.toBe(null);
  });
});

describe("quoted operators", () => {
  test("a pipe, semicolon or && inside quotes is data, not a command separator", () => {
    // The false positive this fixes: a grep alternation whose second branch named a forbidden
    // command was split at the quoted `|` and read as a command of its own.
    expect(checkBash(`grep -n "foo\\|git push --force" AGENTS.md`)).toBe(null);
    expect(checkBash(`grep -nE 'a|${NPM} install left-pad' x.md`)).toBe(null);
    expect(checkBash(`echo "done; git rebase origin/main"`)).toBe(null);
    expect(checkBash(`git commit -m "fix: x && gh pr merge 1"`)).toBe(null);
    expect(checkBash(`git commit -m "line one\ngit push --force"`)).toBe(null);
  });
  test("operators outside quotes still split", () => {
    expect(checkBash(`grep -n "foo|bar" x | git push --force`)).not.toBe(null);
    expect(checkBash(`echo 'a;b'; git rebase origin/main`)).not.toBe(null);
    expect(checkBash(`echo "a" && git push origin "main"`)).not.toBe(null);
  });
  test("an escaped quote does not open or close a quoted span", () => {
    expect(checkBash(`echo \\" | git push --force`)).not.toBe(null);
    expect(checkBash(`echo "a \\" | b" ; git status`)).toBe(null);
  });
  test("an unclosed quote cannot hide a later command", () => {
    expect(checkBash(`echo "unterminated; git push --force`)).not.toBe(null);
  });
  test("a backslash-newline continues the command", () => {
    expect(checkBash(`git push \\\n  --force origin claude/x`)).not.toBe(null);
  });
});

// Critical Mass review of #1865 at e2b0c27, P2 1–5.
describe("review P2 fixes", () => {
  test("P2-1: the repo root anchors paths in a checkout under a src/ or docs/ directory", () => {
    const root = "/home/x/src/verdant-grow-diary";
    expect(repoRelative(`${root}/src/routeTree.gen.ts`, root)).toBe("src/routeTree.gen.ts");
    expect(checkFileEdit(`${root}/src/routeTree.gen.ts`, root)).not.toBe(null);
    const docsRoot = "/home/x/docs/repo";
    expect(repoRelative(`${docsRoot}/supabase/migrations/1_a.sql`, docsRoot)).toBe(
      "supabase/migrations/1_a.sql",
    );
    expect(checkFileEdit(`${docsRoot}/bun.lock`, docsRoot)).not.toBe(null);
  });
  test("P2-2: package runners do not hide production commands", () => {
    for (const cmd of [
      "bunx supabase db push",
      "npx vercel --prod",
      "bun x supabase functions deploy x",
      "pnpm dlx vercel promote x",
      "yarn dlx supabase db push",
    ]) {
      expect(checkBash(cmd), cmd).not.toBe(null);
    }
  });
  test("P2-3: a lone & and ( … ) subshells split commands; redirections do not", () => {
    expect(checkBash("sleep 1 & git push --force")).not.toBe(null);
    expect(checkBash("(git push --force)")).not.toBe(null);
    expect(checkBash("(cd x && git rebase origin/main)")).not.toBe(null);
    expect(checkBash("echo $(git push --force)")).not.toBe(null);
    expect(checkBash("bun run typecheck 2>&1 | tail -5")).toBe(null);
    expect(checkBash("bun run lint &> lint.log")).toBe(null);
  });
  test("P2-4: -x is a boolean Playwright flag, not one that takes a value", () => {
    expect(
      checkBash("bunx playwright test --project=chromium-mocked -x e2e/auth-loading.spec.ts"),
    ).toBe(null);
  });
  test("P2-5: MCP deny rules match whatever the server is prefixed", () => {
    expect(checkMcp("mcp__claude_ai_Supabase__apply_migration", {})).not.toBe(null);
    expect(checkMcp("mcp__supabase__execute_sql", {})).not.toBe(null);
    expect(checkMcp("mcp__my_vercel__request_rollback", {})).not.toBe(null);
    expect(checkMcp("mcp__GitHub__merge_pull_request", {})).not.toBe(null);
    expect(checkMcp("mcp__gh_enterprise_github__update_pull_request", { draft: false })).not.toBe(
      null,
    );
    expect(checkMcp("mcp__claude_ai_Supabase__list_tables", {})).toBe(null);
    expect(checkMcp("mcp__notsupabase_x__execute_sql", {})).toBe(null);
  });
});

// Critical Mass re-review of #1865 at 1d14afd, P2 1–3.
describe("re-review P2 fixes", () => {
  test("P2-1: runner flags do not hide the tool", () => {
    for (const cmd of [
      "npx -y supabase db push",
      "npx --yes vercel --prod",
      "npx -p supabase supabase db push",
      "npx --package=vercel vercel promote x",
      'npx -c "supabase db push"',
      "bunx --bun supabase functions deploy x",
      "pnpm dlx --silent vercel --prod",
    ]) {
      expect(checkBash(cmd), cmd).not.toBe(null);
    }
    expect(checkBash("npx -y prettier --check x.ts")).toBe(null);
  });
  test("P2-2: a $(…) inside double quotes is inspected", () => {
    expect(checkBash('echo "$(git push --force)"')).not.toBe(null);
    expect(checkBash('msg="done: $(git rebase origin/main)"')).not.toBe(null);
    expect(checkBash('echo "x $(echo "$(git push --force)")"')).not.toBe(null);
    expect(checkBash("echo '$(git push --force)'")).toBe(null);
    expect(checkBash('echo "$(git rev-parse --short HEAD)"')).toBe(null);
  });
  test("P2-3: MCP server names with hyphens match by service", () => {
    expect(checkMcp("mcp__claude-ai-supabase__execute_sql", {})).not.toBe(null);
    expect(checkMcp("mcp__supabase-prod__apply_migration", {})).not.toBe(null);
    expect(checkMcp("mcp__my-vercel__request_promote", {})).not.toBe(null);
    expect(checkMcp("mcp__github-enterprise__merge_pull_request", {})).not.toBe(null);
    expect(checkMcp("mcp__notsupabase-x__execute_sql", {})).toBe(null);
    expect(checkMcp("mcp__supabasex__execute_sql", {})).toBe(null);
  });
});

describe("Codex review fixes", () => {
  test("P1: a value-taking Playwright option is not counted as a spec filter", () => {
    for (const cmd of [
      "bunx playwright test --project=chromium-mocked --global-timeout 60000",
      "bunx playwright test --project=chromium-mocked --tsconfig tsconfig.e2e.json",
      "bunx playwright test --project=chromium-mocked --ui-port 9323",
      "npx playwright test --project chromium-mocked --only-changed origin/main",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(
      checkBash(
        "bunx playwright test --project=chromium-mocked --global-timeout 60000 e2e/auth-loading.spec.ts",
      ),
    ).toBe(null);
    expect(
      checkBash(
        "bunx playwright test --project=chromium-mocked --global-timeout=60000 auth-loading",
      ),
    ).toBe(null);
  });
  test("P2: bulk push modes that can include protected branches are denied", () => {
    for (const cmd of [
      "git push --all origin",
      "git push origin --all",
      "git push --mirror origin",
      "git push --branches origin",
      "git push origin :",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("git push --tags origin")).toBe(null);
  });
  test("P2: a wrapper's own options do not hide the command it runs", () => {
    for (const cmd of [
      "env -i git push --force origin claude/task",
      "env --ignore-environment supabase db push",
      "env -u HOME -C /tmp git push origin main",
      "env -i PATH=/usr/bin git push -f",
      'env -S "git push --force origin claude/task"',
      "sudo -u runner -E git push --force",
      "sudo --user=runner gh pr merge 1800",
      "exec -a guard git push --force",
      "time -p git push --force",
      "time -f %e -o t.log supabase db push",
      "env -- git push --force",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("env -i HOME=/tmp git status")).toBe(null);
    expect(checkBash("sudo -u runner git push origin claude/task")).toBe(null);
  });
  test("P2: clustered short flags do not hide a force-push or --no-verify", () => {
    for (const cmd of [
      "git push -uf origin claude/task",
      "git push -fu origin claude/task",
      "git push -qf",
      "git commit -an -m wip",
      "git commit -anm wip",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("git push -u origin claude/task")).toBe(null);
    expect(checkBash("git commit -am 'fix: n-gram'")).toBe(null);
    expect(checkBash("git commit -m 'fix: no-n here'")).toBe(null);
  });
  test("P2: gh pr ready --undo returns a PR to draft and is allowed", () => {
    expect(checkBash("gh pr ready 1800 --undo")).toBe(null);
    expect(checkBash("gh pr ready --undo 1800")).toBe(null);
    expect(checkBash("gh pr ready 1800")).not.toBe(null);
  });
});

describe("Codex re-review P1 fixes", () => {
  test("P1: a value-taking sudo option inside a flag cluster consumes the next token", () => {
    for (const cmd of [
      "sudo -Eu runner git push --force",
      "sudo -nu runner git push origin main",
      "sudo -Eg wheel supabase db push",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("sudo -Eu runner git push origin claude/task")).toBe(null);
    expect(checkBash("sudo -urunner git push --force")).not.toBe(null);
  });
  test("P1: env -S splits its argument the way a shell would, removing quotes", () => {
    for (const cmd of [
      `env -S 'git push "-f" origin claude/task'`,
      `env -S "git push 'origin' 'main'"`,
      `env --split-string='git push "--force"'`,
      `env -iS 'git push -f'`,
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash(`env -S 'git push "origin" "claude/task"'`)).toBe(null);
  });
  test("P1: Playwright's optional --debug mode is not counted as a spec filter", () => {
    for (const cmd of [
      "bunx playwright test --project=chromium-mocked --debug inspector",
      "bunx playwright test --project=chromium-mocked --debug cli",
      "bunx playwright test --project=chromium-mocked --debug",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(
      checkBash("bunx playwright test --project=chromium-mocked --debug e2e/auth-loading.spec.ts"),
    ).toBe(null);
    expect(
      checkBash("bunx playwright test --project=chromium-mocked --debug inspector auth-loading"),
    ).toBe(null);
  });
  test("P1: a wildcard refspec that can expand to a protected branch is denied", () => {
    for (const cmd of [
      "git push origin 'refs/heads/*:refs/heads/*'",
      "git push origin 'refs/heads/*'",
      "git push origin '*:*'",
      "git push origin 'refs/*:refs/*'",
      "git push origin 'refs/heads/m*:refs/heads/m*'",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("git push origin 'refs/heads/claude/*:refs/heads/claude/*'")).toBe(null);
    expect(checkBash("git push origin 'refs/tags/*:refs/tags/*'")).toBe(null);
  });
});

describe("Codex re-review P1: env -S variable expansion", () => {
  test("an env -S string that expands ${VAR} is refused, since its value is unknown here", () => {
    for (const cmd of [
      "F=-f env -S 'git push ${F} origin claude/task'",
      "env -S 'git push ${FLAGS}'",
      "env --split-string='${CMD} origin main'",
      "env -iS '${X}'",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("env -S 'git push origin claude/task'")).toBe(null);
    expect(checkBash('git commit -m "${not} an env split"')).toBe(null);
  });
});

describe("Codex re-review P1: env -S escapes and comments", () => {
  test("an env -S string using env's own escapes or comments is refused", () => {
    for (const cmd of [
      String.raw`env -S 'git\_push\_-f\_origin\_claude/task'`,
      String.raw`env -S 'git push origin claude/task\c -f'`,
      "env -S 'gh pr ready 1800 #--undo'",
      String.raw`env --split-string='git\tpush\t-f'`,
      String.raw`env -S "git\_push\_-f\_origin\_claude/task"`,
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash(`env -S 'git push "origin" claude/task'`)).toBe(null);
  });
});

describe("Codex re-review P1s: abbreviations, --undo values, sudo --chroot", () => {
  test("git accepts unambiguous long-option prefixes, so the guard matches them too", () => {
    for (const cmd of [
      "git push --al origin",
      "git push --mirr origin",
      "git push --bran origin",
      "git push --force-w origin claude/task",
      "git push --force-with origin claude/task",
      "git push --no-veri origin claude/task",
      "git pull --reb origin verdant-grow-diary",
      "git pull --rebase=merges origin verdant-grow-diary",
      "git commit --no-veri -m wip",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("git push --atomic origin claude/task")).toBe(null);
    expect(checkBash("git push --no-thin origin claude/task")).toBe(null);
    expect(checkBash("git pull --no-rebase origin verdant-grow-diary")).toBe(null);
  });
  test("gh pr ready is allowed only when --undo's effective value is true", () => {
    for (const cmd of [
      "gh pr ready 1800 --undo --undo=false",
      "gh pr ready 1800 --undo=false",
      "gh pr ready 1800 --undo=0",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("gh pr ready 1800 --undo")).toBe(null);
    expect(checkBash("gh pr ready 1800 --undo=true")).toBe(null);
    expect(checkBash("gh pr ready 1800 --undo=false --undo")).toBe(null);
  });
  test("sudo's -R/--chroot value is consumed before the command is checked", () => {
    for (const cmd of [
      "sudo -R /tmp git push --force origin claude/task",
      "sudo --chroot /tmp git push --force origin claude/task",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
  });
});

describe("Codex re-review P1: attached env -S argument", () => {
  test("an -S argument attached to the option is split and checked", () => {
    for (const cmd of [
      "env -S'git push -f origin claude/task'",
      'env -S"git push origin main"',
      "env -iS'git push --force'",
      "sudo -urunner git push --force",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("env -S'git push origin claude/task'")).toBe(null);
  });
});

describe("Codex re-review P1s: wrapper long-option prefixes, variadic --project", () => {
  test("env and sudo long options are matched by unambiguous prefix", () => {
    for (const cmd of [
      "env --spli='git push -f origin claude/task'",
      "env --spl 'git push -f origin claude/task'",
      "sudo --us runner git push --force",
      "env --chd /tmp git push --force",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("env --spli='git push origin claude/task'")).toBe(null);
  });
  test("--project without = takes every following word as a project name", () => {
    for (const cmd of [
      "bunx playwright test --project chromium-mocked chromium-authed",
      "bunx playwright test --project chromium-authed chromium-mocked",
      "bunx playwright test --project chromium-mocked e2e/auth-loading.spec.ts",
      "bunx playwright test --project=chromium-authed --project chromium-mocked",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(
      checkBash("bunx playwright test --project=chromium-mocked e2e/auth-loading.spec.ts"),
    ).toBe(null);
    expect(
      checkBash("bunx playwright test e2e/auth-loading.spec.ts --project chromium-mocked"),
    ).toBe(null);
  });
});

describe("Codex re-review P1s: env -S option re-parse, Playwright project wildcards", () => {
  test("words split by env -S are parsed again as env options", () => {
    for (const cmd of [
      "env -S '-- git push -f origin claude/task'",
      "env -S '-i git push -f origin claude/task'",
      "env -S '-u HOME git push --force'",
      "env --split-string='-C /tmp git push --force'",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("env -S '-- git push origin claude/task'")).toBe(null);
  });
  test("project selectors match the way Playwright filters projects", () => {
    for (const cmd of [
      "bunx playwright test --project='chromium-*'",
      "bunx playwright test --project '*'",
      "bunx playwright test --project=*-MOCKED",
      "bunx playwright test --project=Chromium-Mocked",
      "bunx playwright test",
      "bunx playwright test --headed",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    for (const cmd of [
      "bunx playwright test --project='chromium-*' e2e/auth-loading.spec.ts",
      "bunx playwright test --project=chromium-authed",
      "bunx playwright test --project='*-authed'",
      "bunx playwright test e2e/auth-loading.spec.ts",
    ]) {
      expect(checkBash(cmd)).toBe(null);
    }
  });
});

describe("shell redirections are not arguments", () => {
  test("a redirection is neither a package name nor a spec filter", () => {
    for (const cmd of [
      "npm i --no-audit 2>&1 | tail -5",
      "npm i --no-audit > /tmp/install.log",
      "npm i --no-audit >/tmp/install.log 2>/dev/null",
    ]) {
      expect(checkBash(cmd)).toBe(null);
    }
    for (const cmd of [
      "bunx playwright test --project=chromium-mocked 2>&1 | tail -20",
      "bunx playwright test --project=chromium-mocked > /tmp/pw.log",
      "bunx playwright test --project=chromium-mocked >/tmp/pw.log",
      "npm i left-pad 2>&1",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
  });
});

describe("quoted redirection characters stay arguments", () => {
  test("a quoted `>` is a word, so the option after it is still checked", () => {
    for (const cmd of [
      "git push origin '>' -f",
      'git push origin ">" --force',
      "env -S 'git push origin > -f'",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
  });
});

describe("Codex re-review P1: clustered git pull rebase", () => {
  test("-r inside a short-option cluster is a rebase", () => {
    for (const cmd of ["git pull -qr origin main", "git pull -vr origin main", "git pull -rq"]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    for (const cmd of [
      "git pull -q origin main",
      "git pull -sresolve origin main",
      "git pull --no-rebase",
    ]) {
      expect(checkBash(cmd)).toBe(null);
    }
  });
});

describe("Codex re-review P1: empty or unexpanded Playwright filters", () => {
  test("a filter that may be empty is not a spec filter", () => {
    for (const cmd of [
      'bunx playwright test --project=chromium-mocked ""',
      "bunx playwright test --project=chromium-mocked ' '",
      "bunx playwright test --project=chromium-mocked $SPEC",
      'bunx playwright test --project=chromium-mocked "${SPEC}"',
      "bunx playwright test --project=chromium-mocked `cat specs.txt`",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(
      checkBash("bunx playwright test --project=chromium-mocked e2e/auth-loading.spec.ts"),
    ).toBe(null);
  });
});

describe("Codex re-review P1: redirections attached to a preceding word", () => {
  test("the word before an attached redirection is still checked", () => {
    for (const cmd of [
      "git push origin main>/tmp/push.log",
      "git push -f>/tmp/push.log origin claude/task",
      "git push origin main&>/tmp/push.log",
      "git push origin main 2>/dev/null",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("git push origin claude/task>/tmp/push.log")).toBe(null);
    expect(checkBash("npm i --no-audit>/tmp/install.log")).toBe(null);
  });
});

describe("Codex re-review P1: shell expansions as Playwright filters", () => {
  test("only a plain literal word counts as a spec filter", () => {
    for (const cmd of [
      "bunx playwright test --project=chromium-mocked {,}",
      "bunx playwright test --project=chromium-mocked {a,}",
      "bunx playwright test --project=chromium-mocked e2e/*.nomatch",
      "bunx playwright test --project=chromium-mocked e2e/?",
      "bunx playwright test --project=chromium-mocked [x]",
      "bunx playwright test --project=chromium-mocked ~nobody",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    for (const cmd of [
      "bunx playwright test --project=chromium-mocked e2e/auth-loading.spec.ts:12",
      "bunx playwright test --project=chromium-mocked auth-loading",
    ]) {
      expect(checkBash(cmd)).toBe(null);
    }
  });
});

describe("Codex re-review: allocated-FD redirections, commit -u mode", () => {
  test("P1: a {name}> redirection is dropped like a numeric one", () => {
    for (const cmd of [
      "env {guardfd}>/tmp/log git push --force origin claude/task",
      "{fd}>/tmp/log git push -f origin claude/task",
      "git push origin main {fd}>&2",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("{fd}>/tmp/log git push origin claude/task")).toBe(null);
  });
  test("P2: the value attached to commit -u is not scanned for -n", () => {
    for (const cmd of ["git commit -unormal -m wip", "git commit -uno -m wip"]) {
      expect(checkBash(cmd)).toBe(null);
    }
    expect(checkBash("git commit -nu -m wip")).not.toBe(null);
  });
});

describe("Codex re-review: expandable Playwright project selectors", () => {
  test("P1: a --project the shell can expand counts as a mocked selection", () => {
    for (const cmd of [
      "P=chromium-mocked; bunx playwright test --project=$P",
      'bunx playwright test --project "$P"',
      "bunx playwright test --project=$(echo chromium-mocked)",
      "bunx playwright test --project=chromium-{mocked,authed}",
      "bunx playwright test --project=chromium-m?cked",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    for (const cmd of [
      "bunx playwright test --project=$P e2e/auth-loading.spec.ts",
      "bunx playwright test --project=chromium-authed",
    ]) {
      expect(checkBash(cmd)).toBe(null);
    }
  });
});

describe("Codex re-review: --undo after the option terminator", () => {
  test("P1: `--undo` after `--` is a branch name, not the flag", () => {
    for (const cmd of ["gh pr ready -- --undo", "gh pr ready -- --undo=true"]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("gh pr ready --undo -- 1800")).toBe(null);
  });
});

describe("Codex re-review: sudo assignments between sudo options", () => {
  test("P1: sudo keeps parsing its options after a VAR=value", () => {
    for (const cmd of [
      "sudo VAR=x -u root git push --force origin claude/task",
      "sudo -n VAR=x -u root git push -f origin claude/task",
      "sudo A=1 B=2 -E git commit --no-verify -m wip",
    ]) {
      expect(checkBash(cmd)).not.toBe(null);
    }
    expect(checkBash("sudo VAR=x -u root git push origin claude/task")).toBe(null);
  });
});

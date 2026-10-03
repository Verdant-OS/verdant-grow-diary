import { describe, expect, test } from "claude-code/testing";

import { checkBash, checkFileEdit, checkInWarning, checkMcp } from "./rules";

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

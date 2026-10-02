import { describe, expect, test } from "claude-code/testing";

import { checkBash, checkFileEdit, checkInWarning, checkMcp } from "./rules";

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
    "npm install left-pad",
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
    "printf 'registry=https://registry.npmjs.org/\\n' > .npmrc.tmp && npm_config_userconfig=$PWD/.npmrc.tmp npm install --no-audit --no-fund",
    "npm ci",
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

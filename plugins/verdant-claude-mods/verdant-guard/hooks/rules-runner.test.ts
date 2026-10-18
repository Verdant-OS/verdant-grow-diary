import { describe, expect, test } from "claude-code/testing";

import { checkBash } from "./rules";

// Codex P1s on #1935 at ce1c8037: a package runner's own command string is shell-quoted
// (`npx -c`), and pnpm/yarn accept global options before `exec`/`dlx`. Both paths hid a
// force-push from checkBash. New file so the existing rules.test.ts scorer is not edited.

describe("checkBash — package runner command strings are shell-split", () => {
  const denied = [
    `npx -c 'git push "-f" origin claude/task'`,
    `npx --call 'git push "--force" origin claude/task'`,
    `npx --call='git push "-f" origin claude/task'`,
    `bunx -c "git push '-f' origin claude/task"`,
  ];
  for (const command of denied) {
    test(`denies ${command}`, () => {
      expect(checkBash(command)).not.toBeNull();
    });
  }
});

describe("checkBash — pnpm/yarn global options before exec/dlx", () => {
  const denied = [
    "pnpm -C . exec git push -f origin claude/task",
    "pnpm --dir . exec git push --force origin claude/task",
    "pnpm --filter app exec git push -f origin claude/task",
    "pnpm -r exec git push -f origin claude/task",
    "pnpm --dir=. dlx git push -f origin claude/task",
    "yarn --cwd . exec git push -f origin claude/task",
  ];
  for (const command of denied) {
    test(`denies ${command}`, () => {
      expect(checkBash(command)).not.toBeNull();
    });
  }

  const allowed = [
    "pnpm -C . exec git push origin claude/task",
    "pnpm --dir . exec git status",
    `npx -c 'git push origin claude/task'`,
  ];
  for (const command of allowed) {
    test(`allows ${command}`, () => {
      expect(checkBash(command)).toBeNull();
    });
  }
});

// Codex P1s on #1935 at 4640df10: a call string holds whole command lines, runners nest, and
// npx/pnpm accept option forms the first pass did not classify.

describe("checkBash — every command inside an npx call string is checked", () => {
  const denied = [
    "npx -c 'printf ok; git push -f origin claude/task'",
    "npx -c 'printf ok && git push -f origin claude/task'",
  ];
  for (const command of denied) {
    test(`denies ${command}`, () => {
      expect(checkBash(command)).not.toBeNull();
    });
  }
  test("allows a call string whose commands are all harmless", () => {
    expect(checkBash("npx -c 'printf ok; git push origin claude/task'")).toBeNull();
  });
});

describe("checkBash — unclassified pnpm options before exec fail closed", () => {
  test("denies pnpm --test-pattern x exec git push -f", () => {
    expect(checkBash("pnpm --test-pattern x exec git push -f origin claude/task")).not.toBeNull();
  });
  test("allows pnpm --test-pattern x exec git status", () => {
    expect(checkBash("pnpm --test-pattern x exec git status")).toBeNull();
  });
});

describe("checkBash — nested package runners are unwrapped repeatedly", () => {
  const denied = [
    `pnpm exec npx -c 'git push "-f" origin claude/task'`,
    "bunx npx git push -f origin claude/task",
  ];
  for (const command of denied) {
    test(`denies ${command}`, () => {
      expect(checkBash(command)).not.toBeNull();
    });
  }
  test("allows a nested runner carrying a harmless push", () => {
    expect(checkBash("pnpm exec npx -c 'git push origin claude/task'")).toBeNull();
  });
});

describe("checkBash — npx -c= and workspace option values", () => {
  const denied = [
    "npx -c='git push -f origin claude/task'",
    "npx --workspace a -c 'git push -f origin claude/task'",
    "npx -w a -c 'git push -f origin claude/task'",
  ];
  for (const command of denied) {
    test(`denies ${command}`, () => {
      expect(checkBash(command)).not.toBeNull();
    });
  }
  test("allows npx --workspace a -c with a harmless push", () => {
    expect(checkBash("npx --workspace a -c 'git push origin claude/task'")).toBeNull();
  });
});

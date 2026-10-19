import { describe, expect, test } from "claude-code/testing";

import { checkBash } from "./rules";

// Review follow-ups to the verdant-guard Bash rules: package runners (call strings, nesting,
// option operands), shell comments and wrapper options the guard does not know. Each case is a
// command the guard once allowed although it is meant to refuse it, or the harmless form of one.
// Kept apart from rules.test.ts so that scorer-locked file is not edited further.

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

describe("checkBash — an unquoted # comment is not part of the command", () => {
  const denied = [
    "gh pr ready 1800 # --undo",
    "gh pr ready 1800 #--undo",
    "bunx playwright test --project=chromium-mocked # e2e/auth-loading.spec.ts",
    "git rebase origin/verdant-grow-diary # --abort",
  ];
  for (const command of denied) {
    test(`denies ${command}`, () => {
      expect(checkBash(command)).not.toBeNull();
    });
  }
  const allowed = [
    "gh pr ready 1800 --undo # back to draft",
    "git push origin claude/task # never --force",
    "gh pr ready 1800 --undo '#'",
  ];
  for (const command of allowed) {
    test(`allows ${command}`, () => {
      expect(checkBash(command)).toBeNull();
    });
  }
  test("a # inside a word or quotes does not start a comment", () => {
    expect(checkBash("echo a#b; git push -f origin claude/task")).not.toBeNull();
    expect(checkBash("echo '# x'; git push -f origin claude/task")).not.toBeNull();
  });
  test("a comment ends at the newline", () => {
    expect(checkBash("echo ok # note\ngit push -f origin claude/task")).not.toBeNull();
  });
});

describe("checkBash — wrapper options the guard does not know fail closed", () => {
  const denied = [
    // An unlisted option is read both as a flag and as taking the next word.
    "env --argv0 x git push -f origin claude/task",
    "env -a x git push -f origin claude/task",
    "sudo --some-new-option x git push -f origin claude/task",
    "time --some-new-option x git push -f origin claude/task",
    // sudo's -h is --help alone and takes a host only as --host=…: never skip the command.
    "sudo -h git push -f origin claude/task",
  ];
  for (const command of denied) {
    test(`denies ${command}`, () => {
      expect(checkBash(command)).not.toBeNull();
    });
  }
  const allowed = [
    "env -a x git push origin claude/task",
    "sudo -E git status",
    "env -i git push origin claude/task",
  ];
  for (const command of allowed) {
    test(`allows ${command}`, () => {
      expect(checkBash(command)).toBeNull();
    });
  }
});

describe("checkBash — many unknown wrapper options stay checkable", () => {
  const many = "sudo " + "-X ".repeat(20);
  test("a push behind twenty unknown sudo options is still refused", () => {
    expect(checkBash(`${many}git push -f origin claude/task`)).not.toBeNull();
  });
  test("a harmless command behind twenty unknown sudo options is allowed", () => {
    expect(checkBash(`${many}git status`)).toBeNull();
  });
});

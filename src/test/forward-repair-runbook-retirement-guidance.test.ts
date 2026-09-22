import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RETIREMENT_RUNBOOK = "production-environment-retirement-runbook.md";
const RETIREMENT_LINK = `[production environment retirement runbook](${RETIREMENT_RUNBOOK})`;
const ROUTING_DISCLAIMER =
  "Repository routing does not verify hosted settings or authorize a production run.";

const FORWARD_REPAIR_RUNBOOKS = [
  "docs/action-queue-transition-forward-repair-operator-runbook.md",
  "docs/agreement-acceptance-insert-forward-repair-operator-runbook.md",
  "docs/quicklog-manual-delegate-forward-repair-operator-runbook.md",
] as const;

function readRunbook(relativePath: (typeof FORWARD_REPAIR_RUNBOOKS)[number]): string {
  const absolutePath = resolve(relativePath);
  expect(existsSync(absolutePath)).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("forward-repair operator runbooks — retirement-aligned environment guidance", () => {
  it.each(FORWARD_REPAIR_RUNBOOKS)(
    "%s points operators at the retirement runbook instead of stale legacy copy",
    (runbookPath) => {
      const runbook = readRunbook(runbookPath);

      expect(runbook).toContain(RETIREMENT_LINK);
      expect(runbook).toMatch(
        /retired schedules, repointed writers, and remaining manual read paths/i,
      );
      expect(runbook).toContain(ROUTING_DISCLAIMER);
      expect(runbook).toContain("verdant-production-solo-founder");
      expect(runbook).toMatch(/do not rely on GitHub auto-creating the environment/i);
      expect(runbook).toMatch(/copy credentials from[\s\S]{0,80}legacy `verdant-production`/i);
      expect(runbook).toContain("knkwiiywfkbqznbxwqfh");

      expect(runbook).not.toMatch(/known-mismatched secret/i);
      expect(runbook).not.toMatch(/production writers remain unchanged/i);
    },
  );

  it("keeps the retirement runbook present for the linked guidance", () => {
    expect(existsSync(resolve("docs", RETIREMENT_RUNBOOK))).toBe(true);
  });
});

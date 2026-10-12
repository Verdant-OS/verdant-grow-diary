import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DAILY_CHECK = readFileSync(resolve(__dirname, "../pages/DailyCheck.tsx"), "utf8");

/**
 * The class token `hidden` matches `\bhidden\b` by itself. Strip class
 * attributes first so only a real HTML `hidden` attribute (or `hidden="..."`)
 * satisfies the check. `aria-hidden` is asserted separately.
 */
function stepListOpeningTag(): string {
  const tag = DAILY_CHECK.match(/<span[^>]*data-testid="daily-grow-check-step-list"[^>]*>/)?.[0];
  expect(tag, "daily-grow-check-step-list span not found").toBeDefined();
  return tag ?? "";
}

function withoutClassAttributes(tag: string): string {
  return tag.replace(/\sclassName=(?:"[^"]*"|'[^']*'|\{[^}]*\})/g, "");
}

describe("Daily Check step-list hidden attribute", () => {
  it("keeps the HTML hidden attribute after the class name is removed", () => {
    const tag = stepListOpeningTag();
    const stripped = withoutClassAttributes(tag);
    expect(stripped).not.toMatch(/className=/);
    expect(stripped).toMatch(/\shidden(?:="[^"]*")?(?=[\s/>])/);
    expect(tag).toMatch(/\saria-hidden="true"/);
  });

  it("fails the attribute check when only className hidden remains", () => {
    const classOnly = '<span className="hidden" data-testid="daily-grow-check-step-list">';
    const stripped = withoutClassAttributes(classOnly);
    expect(stripped).not.toMatch(/\shidden(?:="[^"]*")?(?=[\s/>])/);
  });
});

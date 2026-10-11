/**
 * Mobile text-size floor at 640px.
 *
 * The @media (max-width: 640px) rule in src/styles.css lifts the smallest
 * utility sizes to 0.875rem so a phone does not render a larger class
 * smaller than a smaller class. 10px, 11px, 12px and text-xs share that
 * floor. 9px shares that floor too.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(path.resolve(__dirname, "../styles.css"), "utf8");

function mediaBlockAt(css: string, start: number): string {
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error("unterminated 640px media rule");
}

/** The utilities floor that already lifts .text-[10px], not the body 16px floor. */
function mobileTextFloorRule(css: string): string {
  const marker = "@media (max-width: 640px)";
  let from = 0;
  while (from < css.length) {
    const start = css.indexOf(marker, from);
    if (start < 0) break;
    const block = mediaBlockAt(css, start);
    if (block.includes(".text-\\[10px\\]")) return block;
    from = start + marker.length;
  }
  throw new Error("640px rule that lifts .text-[10px] is missing");
}

describe("mobile text-size floor", () => {
  it("covers 9px, 10px, 11px, 12px and xs inside the 640px rule", () => {
    const rule = mobileTextFloorRule(CSS);
    expect(rule).toContain(".text-\\[9px\\]");
    expect(rule).toContain(".text-\\[10px\\]");
    expect(rule).toContain(".text-\\[11px\\]");
    expect(rule).toContain(".text-\\[12px\\]");
    expect(rule).toContain(".text-xs");
    expect(rule).toContain("font-size: 0.875rem");
    expect(rule).toContain("line-height: 1.25rem");
  });
});

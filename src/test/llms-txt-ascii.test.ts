/**
 * public/llms.txt is served as text/plain with no charset, so any non-ASCII
 * character (for example an em dash) can be decoded as Latin-1 by AI crawlers
 * and shows as mojibake. Keep the file plain ASCII.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");

describe("public/llms.txt", () => {
  it("contains only ASCII characters", () => {
    const text = readFileSync(resolve(ROOT, "public/llms.txt"), "utf8");
    const offenders: string[] = [];
    text.split("\n").forEach((line, index) => {
      for (const char of line) {
        const code = char.codePointAt(0) ?? 0;
        if (code > 0x7f) {
          const hex = code.toString(16).toUpperCase().padStart(4, "0");
          offenders.push(`line ${index + 1}: U+${hex}`);
        }
      }
    });
    expect(offenders).toEqual([]);
  });
});

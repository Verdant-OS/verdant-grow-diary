/**
 * P3-B static guard: every target="_blank" in non-test src .tsx must include noopener.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "test" || ent.name === "node_modules") continue;
      walkTsx(full, out);
    } else if (ent.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("target=_blank security hygiene", () => {
  it("no non-test .tsx under src/ has target=_blank without noopener", () => {
    const root = path.resolve(__dirname, "..");
    const files = walkTsx(root);
    const offenders: string[] = [];

    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      let idx = 0;
      while (true) {
        const found = text.indexOf('target="_blank"', idx);
        if (found < 0) break;
        const windowStart = Math.max(0, found - 280);
        const windowEnd = Math.min(text.length, found + 220);
        const window = text.slice(windowStart, windowEnd);
        if (!/\bnoopener\b/.test(window)) {
          const line = text.slice(0, found).split("\n").length;
          offenders.push(`${path.relative(root, file)}:${line}`);
        }
        idx = found + 1;
      }
    }

    expect(offenders, `missing noopener:\n${offenders.join("\n")}`).toEqual([]);
  });
});

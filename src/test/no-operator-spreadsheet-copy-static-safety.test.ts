// Static safety: forbid operator-facing spreadsheet/XLSX import copy in
// rendered surfaces (pages + components). Tests, docs, and lib internals are
// intentionally out of scope.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src/pages", "src/components"].map((p) =>
  path.resolve(__dirname, "../..", p),
);

const FORBIDDEN = [
  /XLSX\s+import/i,
  /Excel\s+import/i,
  /Upload\s+spreadsheet/i,
  /Import\s+readings\s+from\s+XLSX/i,
  /Genetics\s+XLSX/i,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("operator-facing surfaces contain no spreadsheet-import copy", () => {
  const files = ROOTS.flatMap(walk);
  it("scans at least one file", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const pattern of FORBIDDEN) {
    it(`no surface mentions ${pattern}`, () => {
      const hits: string[] = [];
      for (const f of files) {
        const src = fs.readFileSync(f, "utf8");
        if (pattern.test(src)) hits.push(path.relative(process.cwd(), f));
      }
      expect(hits).toEqual([]);
    });
  }
});

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(process.cwd(), "src");

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "test" && entry.name !== "integrations")
        out.push(...sourceFiles(absolute));
      continue;
    }
    if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)) {
      out.push(absolute);
    }
  }
  return out;
}

describe("diary reader retraction compatibility inventory", () => {
  it("routes every physical retracted_at filter through the deploy-order compatibility seam", () => {
    const offenders = sourceFiles(SRC_ROOT)
      .filter((file) => !file.endsWith(path.join("quick-log", "retractionFilterCompat.ts")))
      .map((file) => ({ file, source: fs.readFileSync(file, "utf8") }))
      .filter(({ source }) => /\.(?:is|not)\(\s*["']retracted_at["']/.test(source))
      .filter(({ source }) => {
        const operationalFilterLines = source
          .split(/\r?\n/)
          .filter((line) => /\.is\(\s*["']retracted_at["']/.test(line));
        if (operationalFilterLines.length > 0 && !source.includes("selectWithRetractionCompat")) {
          return true;
        }
        if (operationalFilterLines.some((line) => !line.includes("withRetractionFilter"))) {
          return true;
        }

        const hasRetractionDisclosure = /\.not\(\s*["']retracted_at["']/.test(source);
        return hasRetractionDisclosure && !source.includes("isMissingRetractedColumnError");
      })
      .map(({ file }) => path.relative(process.cwd(), file).replaceAll("\\", "/"))
      .sort();

    expect(offenders).toEqual([]);
  });
});

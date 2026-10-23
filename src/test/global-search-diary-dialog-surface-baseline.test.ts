/**
 * Global search diary spec — dialog surface baseline (requirements 7–8).
 *
 * Before diary ships, the palette exposes four entity groups, slices the flat
 * list at INITIAL_VISIBLE (10), and keys preview sync by type+id only. Each
 * is a regression trap for the implementing slice.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("global search diary dialog surface baseline", () => {
  it("lists exactly four entity groups with no diary slot yet", () => {
    const source = readSrc("src/components/GlobalSearchDialog.tsx");
    const match = source.match(/const GROUP_ORDER: GlobalSearchEntityType\[\] = \[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const tokens = match![1].split(",").map((t) => t.trim().replace(/"/g, ""));
    expect(tokens).toEqual(["grow", "tent", "plant", "cultivar"]);
    expect(tokens).not.toContain("diary");
  });

  it("caps the first rendered page at INITIAL_VISIBLE = 10 (diary first-page trap)", () => {
    const source = readSrc("src/components/GlobalSearchDialog.tsx");
    expect(source).toMatch(/const INITIAL_VISIBLE = 10;/);
    expect(source).toMatch(/filteredResults\.slice\(0, visibleCount\)/);
  });

  it("keys preview sync by entity type and id only, not diary excerpt label", () => {
    const source = readSrc("src/components/GlobalSearchDialog.tsx");
    const fnBlock = source.slice(
      source.indexOf("function resultsContentKey"),
      source.indexOf("export default function GlobalSearchDialog"),
    );
    expect(fnBlock).toContain("${r.entity_type}:${r.id}");
    expect(fnBlock).not.toContain("label");
  });
});

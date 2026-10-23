/**
 * Global search diary spec — dormant navigation catalog (established fact in spec).
 *
 * `GLOBAL_SEARCH_ITEMS` is not wired into the live search path today. Wiring it
 * is out of scope for diary search; this locks the pre-change surface area.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("global search diary runtime wiring baseline", () => {
  it("does not import GLOBAL_SEARCH_ITEMS from useGlobalSearch or GlobalSearchDialog", () => {
    const hookSource = readSrc("src/hooks/useGlobalSearch.ts");
    const dialogSource = readSrc("src/components/GlobalSearchDialog.tsx");
    expect(hookSource.includes("globalSearchItems")).toBe(false);
    expect(dialogSource.includes("globalSearchItems")).toBe(false);
  });
});

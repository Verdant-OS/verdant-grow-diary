import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = readFileSync(resolve(process.cwd(), "scripts/sync-edge-shared.mjs"), "utf8");

describe("sync-edge-shared deterministic manifest contract", () => {
  it("sorts filesystem traversal inputs before building the edge mirror manifest", () => {
    expect(SCRIPT).toContain("entries.sort((a, b) => a.name.localeCompare(b.name));");
    expect(SCRIPT).toContain("dirents.sort((a, b) => a.name.localeCompare(b.name));");
    expect(SCRIPT).toContain("return out.sort((a, b) => a.localeCompare(b));");
    expect(SCRIPT).toContain("const collectedEntries = [...collected.entries()].sort");
  });

  it("compares manifest sourceHashes semantically instead of by JSON key order", () => {
    expect(SCRIPT).toContain("function sameStringMap(a, b)");
    expect(SCRIPT).toContain("if (!sameStringMap(committedManifest.sourceHashes, sourceHashes))");
    expect(SCRIPT).not.toContain("JSON.stringify(committedManifest.sourceHashes)");
  });
});

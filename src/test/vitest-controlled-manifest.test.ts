import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  buildManifest,
  dedupeAndSort,
  hashManifest,
  normalizeRelative,
  assertManifestIncludeParity,
  discoverTestFiles,
} from "../../scripts/vitest-controlled/manifest.mjs";

function scratchRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-manifest-"));
  fs.mkdirSync(path.join(root, "src", "a", "deep"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "b"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "node_modules", "junk"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a", "one.test.ts"), "");
  fs.writeFileSync(path.join(root, "src", "a", "two.spec.tsx"), "");
  fs.writeFileSync(path.join(root, "src", "a", "deep", "three.test.tsx"), "");
  fs.writeFileSync(path.join(root, "src", "b", "not-a-test.ts"), "");
  fs.writeFileSync(path.join(root, "src", "node_modules", "junk", "ignored.test.ts"), "");
  return root;
}

describe("vitest-controlled manifest", () => {
  it("discovers only include-pattern matches and sorts deterministically", () => {
    const root = scratchRepo();
    const files = discoverTestFiles(root);
    expect(files).toEqual([
      "src/a/deep/three.test.tsx",
      "src/a/one.test.ts",
      "src/a/two.spec.tsx",
    ]);
  });

  it("normalizes Windows-style separators", () => {
    const rel = normalizeRelative("/repo", "/repo/src/a/x.test.ts");
    expect(rel).toBe("src/a/x.test.ts");
    // simulate mixed sep input
    const rel2 = normalizeRelative("/repo", "src\\a\\x.test.ts".split("\\").join(path.sep));
    expect(rel2).toBe("src/a/x.test.ts");
  });

  it("rejects duplicates", () => {
    expect(() => dedupeAndSort(["src/a.test.ts", "src/a.test.ts"])).toThrow(/Duplicate/);
  });

  it("hash is stable across identical inputs and changes when file list changes", () => {
    const a = hashManifest(["src/a.test.ts", "src/b.test.ts"]);
    const b = hashManifest(["src/a.test.ts", "src/b.test.ts"]);
    const c = hashManifest(["src/a.test.ts", "src/c.test.ts"]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("buildManifest returns schema, count, hash, and files", () => {
    const root = scratchRepo();
    const m = buildManifest(root);
    expect(m.schema).toBe(1);
    expect(m.count).toBe(3);
    expect(m.hash).toMatch(/^[0-9a-f]{64}$/);
    assertManifestIncludeParity(m);
  });

  it("assertManifestIncludeParity rejects entries outside include root", () => {
    expect(() =>
      assertManifestIncludeParity({ files: ["scripts/other.test.ts"] }),
    ).toThrow(/outside include root/);
  });
});

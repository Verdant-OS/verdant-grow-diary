/**
 * #2590: CI flakes when bun install fetches xlsx from cdn.sheetjs.com (egress
 * denied or tarball extract failures). The fix vendors xlsx@0.20.3 in-repo.
 * This contract keeps installs offline-safe without re-running bun install in CI.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};
const bunLock = readFileSync(resolve(root, "bun.lock"), "utf8");

const VENDORED_SPEC = "file:vendor/xlsx-0.20.3.tgz";
const VENDOR_PATH = resolve(root, "vendor/xlsx-0.20.3.tgz");
const LOCKED_INTEGRITY =
  "sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==";

describe("xlsx is vendored for offline-safe bun install", () => {
  it("pins xlsx to the committed tarball in package.json", () => {
    expect(packageJson.dependencies.xlsx).toBe(VENDORED_SPEC);
  });

  it("ships the tarball next to the lockfile", () => {
    expect(existsSync(VENDOR_PATH)).toBe(true);
  });

  it("locks xlsx to the vendor path with the pinned integrity hash, not the SheetJS CDN", () => {
    expect(bunLock).toContain("xlsx@vendor/xlsx-0.20.3.tgz");
    expect(bunLock).toContain(LOCKED_INTEGRITY);
    expect(bunLock).not.toMatch(/cdn\.sheetjs\.com/i);
  });
});

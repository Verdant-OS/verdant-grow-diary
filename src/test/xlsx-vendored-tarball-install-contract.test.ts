/**
 * Install contract: `xlsx` must resolve from the committed vendor tarball, not
 * SheetJS CDN. A CDN URL breaks frozen `bun install` in restricted networks
 * (documented in docs/audits/2026-10-03-funnel-briefs-validators-audit.md).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..", "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};
const bunLock = readFileSync(resolve(root, "bun.lock"), "utf8");

const VENDORED_SPEC = "file:vendor/xlsx-0.20.3.tgz";
const VENDORED_PATH = "vendor/xlsx-0.20.3.tgz";

describe("xlsx vendored tarball install contract", () => {
  it("pins xlsx to the committed vendor tarball in package.json", () => {
    expect(packageJson.dependencies.xlsx).toBe(VENDORED_SPEC);
  });

  it("keeps the vendor tarball in the repository", () => {
    const abs = resolve(root, VENDORED_PATH);
    expect(existsSync(abs)).toBe(true);
    expect(statSync(abs).size).toBeGreaterThan(10_000);
  });

  it("locks bun.lock to the vendor path and not SheetJS CDN", () => {
    expect(bunLock).toContain(`"xlsx": ["xlsx@${VENDORED_PATH}"`);
    expect(bunLock).not.toMatch(/cdn\.sheetjs\.com/i);
  });
});

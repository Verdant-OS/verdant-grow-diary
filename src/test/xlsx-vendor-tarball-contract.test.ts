/**
 * #2590 — xlsx is vendored so CI installs never fetch cdn.sheetjs.com (403 off Lovable).
 * Pins the dependency spec, on-disk tarball, and bun.lock resolution so a revert to the
 * CDN URL fails in CI before installs break again.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const VENDOR_TARBALL = "vendor/xlsx-0.20.3.tgz";
const XLSX_SPEC = `file:${VENDOR_TARBALL}`;

describe("xlsx vendor tarball contract (#2590)", () => {
  it("declares the vendored tarball in package.json", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.xlsx).toBe(XLSX_SPEC);
  });

  it("keeps the vendored tarball committed beside package.json", () => {
    expect(existsSync(resolve(ROOT, VENDOR_TARBALL))).toBe(true);
  });

  it("resolves xlsx from the vendor tarball in bun.lock, not a remote registry URL", () => {
    const lockText = readFileSync(resolve(ROOT, "bun.lock"), "utf8");
    expect(lockText).not.toMatch(/cdn\.sheetjs\.com/i);
    expect(lockText).not.toMatch(/https?:\/\/.*sheetjs/i);
    expect(lockText).toMatch(/"xlsx":\s*"file:vendor\/xlsx-0\.20\.3\.tgz"/);
    expect(lockText).toMatch(/"xlsx":\s*\["xlsx@vendor\/xlsx-0\.20\.3\.tgz"/);
  });
});

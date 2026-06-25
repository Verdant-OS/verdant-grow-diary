import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STATIC_GUARD_FILES = [
  "src/test/feeding-history.test.ts",
  "src/test/manual-sensor-reading-entry.test.ts",
  "src/test/photo-history.test.ts",
  "src/test/typed-watering-write-feature-flag.test.ts",
  "src/test/watering-history.test.ts",
] as const;

describe("static-guards script + CI wiring", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const script = pkg.scripts["test:static-guards"];
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");

  it("defines a test:static-guards npm script", () => {
    expect(script).toBeTruthy();
    expect(script).toMatch(/^vitest run /);
  });

  it("includes every known timeout-prone fs-walking guard file", () => {
    for (const file of STATIC_GUARD_FILES) {
      expect(script, `missing ${file}`).toContain(file);
    }
  });

  it("CI runs bun run test:static-guards as its own step", () => {
    expect(ci).toMatch(/bun run test:static-guards/);
  });
});

describe("action-detail-leakage script + CI wiring", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const script = pkg.scripts["test:action-detail-leakage"];
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");

  it("defines a test:action-detail-leakage npm script", () => {
    expect(script).toBeTruthy();
    expect(script).toMatch(/^vitest run /);
    expect(script).toContain("src/test/action-detail-evidence-provenance-leakage.test.tsx");
  });

  it("CI runs bun run test:action-detail-leakage as its own step", () => {
    expect(ci).toMatch(/bun run test:action-detail-leakage/);
  });
});

describe("action-queue-evidence-leakage script + CI wiring", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const script = pkg.scripts["test:action-queue-evidence-leakage"];
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");

  it("defines a test:action-queue-evidence-leakage npm script", () => {
    expect(script).toBeTruthy();
    expect(script).toMatch(/^vitest run /);
    expect(script).toContain("src/test/action-queue-evidence-provenance-leakage.test.ts");
  });

  it("CI runs bun run test:action-queue-evidence-leakage as its own step", () => {
    expect(ci).toMatch(/bun run test:action-queue-evidence-leakage/);
  });
});

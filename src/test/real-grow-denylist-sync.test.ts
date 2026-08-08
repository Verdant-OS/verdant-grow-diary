/**
 * Option A: single-source denylist — fixtureSafety and rotation core must
 * re-export the same module identity (not a forked copy).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as shared from "../../scripts/e2e/real-grow-denylist.mjs";
import * as rotation from "../../scripts/e2e/e2e-fixture-rotation-core.mjs";
import {
  REAL_GROW_NAME_DENYLIST as safetyList,
  isForbiddenRealGrowName as safetyForbidden,
  buildE2eHuntName as safetyHuntName,
} from "../../e2e/lib/fixtureSafety";

const ROOT = resolve(__dirname, "../..");

describe("real-grow-denylist single source", () => {
  it("rotation core re-exports the same denylist array reference", () => {
    expect(rotation.REAL_GROW_NAME_DENYLIST).toBe(shared.REAL_GROW_NAME_DENYLIST);
    expect(safetyList).toBe(shared.REAL_GROW_NAME_DENYLIST);
  });

  it("isForbiddenRealGrowName is shared behavior", () => {
    expect(safetyForbidden("Project McDonald")).toBe(true);
    expect(rotation.isForbiddenRealGrowName("Project McDonald")).toBe(true);
    expect(shared.isForbiddenRealGrowName("E2E Starter Grow")).toBe(false);
    expect(safetyForbidden("E2E Starter Grow")).toBe(false);
  });

  it("buildE2eHuntName matches across surfaces", () => {
    const d = new Date("2026-08-08T00:00:00Z");
    expect(safetyHuntName("paid-journey", d)).toBe(shared.buildE2eHuntName("paid-journey", d));
    expect(rotation.buildE2eHuntName("paid-journey", d)).toBe(
      shared.buildE2eHuntName("paid-journey", d),
    );
  });

  it("fixtureSafety and rotation core do not redefine denylist patterns locally", () => {
    const safety = readFileSync(resolve(ROOT, "e2e/lib/fixtureSafety.ts"), "utf8");
    const core = readFileSync(resolve(ROOT, "scripts/e2e/e2e-fixture-rotation-core.mjs"), "utf8");
    expect(safety).toMatch(/real-grow-denylist\.mjs/);
    expect(core).toMatch(/real-grow-denylist\.mjs/);
    // No local pattern literals for the two known grows
    expect(safety).not.toMatch(/Project\\s\+McDonald/);
    expect(core).not.toMatch(/Project\\s\+McDonald/);
  });
});

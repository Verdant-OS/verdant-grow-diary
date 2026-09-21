/**
 * GDP-GROW-SCOPED-CTA-GROWID-001
 *
 * Grow-scoped continue CTAs must keep `?growId=` when the current grow
 * context already has one. Reports already does this via sensorsPath.
 * Timeline / Dashboard / Start Check must match that helper, not invent a
 * second query shape, and must not invent a grow when none is in context.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveOneTentLoopNextStep } from "@/lib/oneTentLoopNavigationRules";
import { sensorsPath, withGrowId } from "@/lib/routes";

const GROW = "4cad3cae-1111-4000-8000-000000000001";
const TENT = "00000000-0000-4000-8000-00000000000a";
const PLANT = "3f7a1e2c-9b04-4d51-8a6e-2c5f70b81d93";
const ROOT = resolve(__dirname, "../..");

describe("grow-scoped continue CTAs retain growId", () => {
  it("Timeline Review sensor snapshot uses sensorsPath/withGrowId, including tent/plant intent", () => {
    expect(resolveOneTentLoopNextStep("timeline", { growId: GROW }).href).toBe(sensorsPath(GROW));
    expect(
      resolveOneTentLoopNextStep("timeline", {
        growId: GROW,
        tentId: TENT,
      }).href,
    ).toBe(withGrowId(`/sensors?tentId=${TENT}`, GROW));
    expect(
      resolveOneTentLoopNextStep("timeline", {
        growId: GROW,
        tentId: TENT,
        plantId: PLANT,
      }).href,
    ).toBe(withGrowId(`/sensors?tentId=${TENT}&tentIntent=required&plantId=${PLANT}`, GROW));
  });

  it("does not invent a grow when Timeline has no growId", () => {
    expect(resolveOneTentLoopNextStep("timeline", {}).href).toBe("/sensors");
    expect(resolveOneTentLoopNextStep("timeline", { growId: "   " }).href).toBe("/sensors");
    expect(resolveOneTentLoopNextStep("timeline", { tentId: TENT }).href).toBe(
      `/sensors?tentId=${TENT}`,
    );
  });

  it("Dashboard Open sensors and Start Check CTAs reuse withGrowId/sensorsPath", () => {
    const dashboard = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
    const card = readFileSync(resolve(ROOT, "src/components/DailyGrowCheckStatusCard.tsx"), "utf8");

    expect(dashboard).toMatch(/sensorsPath\(scopedGrowId\)/);
    expect(dashboard).toMatch(/withGrowId\("\/sensors#manual-reading",\s*scopedGrowId\)/);
    expect(dashboard).toMatch(/withGrowId\("\/sensors#csv-import",\s*scopedGrowId\)/);
    expect(dashboard).toMatch(/withGrowId\("\/daily-check",\s*scopedGrowId\)/);
    expect(dashboard).toMatch(/growId=\{scopedGrowId\s*\?\?\s*null\}/);

    expect(card).toMatch(/withGrowId\("\/daily-check",\s*growId\)/);
    expect(card).not.toMatch(/to=["']\/daily-check["']/);

    expect(sensorsPath(GROW)).toBe(`/sensors?growId=${GROW}`);
    expect(withGrowId("/daily-check", GROW)).toBe(`/daily-check?growId=${GROW}`);
    expect(withGrowId("/sensors#manual-reading", GROW)).toBe(
      `/sensors?growId=${GROW}#manual-reading`,
    );
    expect(withGrowId("/daily-check", null)).toBe("/daily-check");
    expect(withGrowId("/sensors", undefined)).toBe("/sensors");
  });
});

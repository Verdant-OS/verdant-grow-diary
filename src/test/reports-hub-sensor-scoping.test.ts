/**
 * Live-audit bug #16: the Reports Hub claimed "No recent sensor readings
 * recorded for this grow" while the Dashboard showed a usable manual
 * reading on the grow's tent.
 *
 * Contract locked here:
 *  - Tent resolution for the sensor summary is grow-linked tents UNION
 *    tents hosting the grow's active plants (resolveReportsHubSensorTentIds)
 *    — a tent the grower stocked with the grow's plants but never linked
 *    via `tents.grow_id` is still the grow's tent.
 *  - The sensor page query carries no raw SQL `source` filter; the
 *    normalized `isReportsHubSensorContextRow` fence is the single
 *    eligibility authority (mirrors the Dashboard readings query).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isReportsHubSensorContextRow,
  resolveReportsHubSensorTentIds,
} from "@/hooks/useReportsHubData";

const ROOT = resolve(__dirname, "../..");
const HOOK_SRC = readFileSync(resolve(ROOT, "src/hooks/useReportsHubData.ts"), "utf8");

describe("resolveReportsHubSensorTentIds — grow-vs-tent scoping", () => {
  it("audit repro: a plant-hosted tent with no tents.grow_id link is still resolved", () => {
    expect(
      resolveReportsHubSensorTentIds([], [{ tent_id: "tent-manual" }]),
    ).toEqual(["tent-manual"]);
  });

  it("unions grow-linked and plant-hosted tents with dedupe", () => {
    expect(
      resolveReportsHubSensorTentIds(
        [{ id: "tent-a" }, { id: "tent-b" }],
        [{ tent_id: "tent-b" }, { tent_id: "tent-c" }, { tent_id: "tent-c" }],
      ),
    ).toEqual(["tent-a", "tent-b", "tent-c"]);
  });

  it("sorts deterministically and drops blanks/nulls", () => {
    expect(
      resolveReportsHubSensorTentIds(
        [{ id: "z" }, { id: "" }, null, { id: "  " }],
        [{ tent_id: "a" }, { tent_id: null }, undefined, {}],
      ),
    ).toEqual(["a", "z"]);
    expect(resolveReportsHubSensorTentIds(null, null)).toEqual([]);
  });
});

describe("useReportsHubData — sensor query scoping (static wiring)", () => {
  it("resolves tents from both tents.grow_id and the grow's active plants", () => {
    expect(HOOK_SRC).toMatch(
      /from\(\s*["']tents["']\s*\)\.select\(\s*["']id["']\s*\)\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)/,
    );
    expect(HOOK_SRC).toMatch(
      /from\(\s*["']plants["']\s*\)[\s\S]*?\.select\(\s*["']tent_id["']\s*\)[\s\S]*?\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)[\s\S]*?\.eq\(\s*["']is_archived["']\s*,\s*false\s*\)[\s\S]*?\.not\(\s*["']tent_id["']\s*,\s*["']is["']\s*,\s*null\s*\)/,
    );
    expect(HOOK_SRC).toContain("resolveReportsHubSensorTentIds(");
  });

  it("applies no raw SQL source filter — the normalized fence decides", () => {
    expect(HOOK_SRC).not.toMatch(/\.in\(\s*["']source["']/);
  });

  it("fence still admits normalized alias sources the Dashboard displays", () => {
    // Raw "user" normalizes to manual; raw "sensor" normalizes to live.
    expect(
      isReportsHubSensorContextRow({ ts: "2026-07-17T10:00:00Z", source: "user" }),
    ).toBe(true);
    expect(
      isReportsHubSensorContextRow({ ts: "2026-07-17T10:00:00Z", source: "sensor" }),
    ).toBe(true);
    // Demo and unknown sources stay excluded.
    expect(
      isReportsHubSensorContextRow({ ts: "2026-07-17T10:00:00Z", source: "demo" }),
    ).toBe(false);
    expect(
      isReportsHubSensorContextRow({ ts: "2026-07-17T10:00:00Z", source: "??" }),
    ).toBe(false);
  });
});

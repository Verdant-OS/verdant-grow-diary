/**
 * Live-audit bug #16 + PR #413 review follow-ups: the Reports Hub claimed
 * "No recent sensor readings recorded for this grow" while the Dashboard
 * showed a usable manual reading on the grow's tent.
 *
 * Contract locked here:
 *  - Tent resolution for the sensor summary is grow-linked tents UNION
 *    UNASSIGNED (grow_id null) tents hosting the grow's active plants
 *    (resolveReportsHubSensorTentIds). A tent explicitly assigned to
 *    ANOTHER grow never qualifies — one migrated plant must not pull the
 *    other grow's sensor history into this grow's report.
 *  - The sensor page query keeps a server-side source pre-filter, but it
 *    is DERIVED from the same alias table the normalized
 *    `isReportsHubSensorContextRow` fence uses (rawSensorSourceValuesFor),
 *    so the two can never disagree about which raw tokens are eligible.
 *  - "Latest reading" compares resolved observation times
 *    (laterObservation) instead of trusting database order, so a legacy
 *    null-captured_at row with a newer ts is never shadowed by an older
 *    row that has captured_at set.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isReportsHubSensorContextRow,
  laterObservation,
  resolveReportsHubSensorTentIds,
} from "@/hooks/useReportsHubData";
import { rawSensorSourceValuesFor } from "@/lib/sensor/sensorSourceRules";

const ROOT = resolve(__dirname, "../..");
const HOOK_SRC = readFileSync(resolve(ROOT, "src/hooks/useReportsHubData.ts"), "utf8");

const GROW_A = "grow-a";
const GROW_B = "grow-b";

describe("resolveReportsHubSensorTentIds — grow-vs-tent scoping", () => {
  it("audit repro: an UNASSIGNED plant-hosted tent is resolved for the grow", () => {
    expect(
      resolveReportsHubSensorTentIds(
        [{ id: "tent-manual", grow_id: null }],
        [{ tent_id: "tent-manual" }],
        GROW_A,
      ),
    ).toEqual(["tent-manual"]);
  });

  it("review follow-up: a tent assigned to ANOTHER grow never leaks in via a migrated plant", () => {
    // AssignTentDialog moves plants.tent_id without touching plants.grow_id,
    // so grow A can hold a plant sitting in grow B's tent.
    expect(
      resolveReportsHubSensorTentIds(
        [
          { id: "tent-of-a", grow_id: GROW_A },
          { id: "tent-of-b", grow_id: GROW_B },
        ],
        [{ tent_id: "tent-of-b" }],
        GROW_A,
      ),
    ).toEqual(["tent-of-a"]);
  });

  it("an unassigned tent without this grow's plants is not swept in", () => {
    expect(
      resolveReportsHubSensorTentIds(
        [
          { id: "tent-of-a", grow_id: GROW_A },
          { id: "unrelated-orphan", grow_id: null },
        ],
        [],
        GROW_A,
      ),
    ).toEqual(["tent-of-a"]);
  });

  it("unions grow-linked and unassigned plant-hosted tents with dedupe and sorting", () => {
    expect(
      resolveReportsHubSensorTentIds(
        [
          { id: "tent-z", grow_id: GROW_A },
          { id: "tent-a", grow_id: null },
          { id: "tent-a", grow_id: null },
          { id: "", grow_id: null },
          null,
        ],
        [{ tent_id: "tent-a" }, { tent_id: null }, undefined, {}],
        GROW_A,
      ),
    ).toEqual(["tent-a", "tent-z"]);
    expect(resolveReportsHubSensorTentIds(null, null, GROW_A)).toEqual([]);
  });
});

describe("useReportsHubData — sensor query scoping (static wiring)", () => {
  it("candidate tents are this grow's linked tents plus unassigned tents", () => {
    expect(HOOK_SRC).toMatch(
      /from\(\s*["']tents["']\s*\)[\s\S]{0,120}?\.or\(\s*`grow_id\.eq\.\$\{growId\},grow_id\.is\.null`\s*\)/,
    );
    expect(HOOK_SRC).toMatch(
      /from\(\s*["']plants["']\s*\)[\s\S]*?\.select\(\s*["']tent_id["']\s*\)[\s\S]*?\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)[\s\S]*?\.eq\(\s*["']is_archived["']\s*,\s*false\s*\)[\s\S]*?\.not\(\s*["']tent_id["']\s*,\s*["']is["']\s*,\s*null\s*\)/,
    );
    expect(HOOK_SRC).toContain("resolveReportsHubSensorTentIds(");
  });

  it("server-side source pre-filter is derived from the shared alias table", () => {
    expect(HOOK_SRC).toMatch(
      /\.in\(\s*["']source["']\s*,\s*rawSensorSourceValuesFor\(\s*\[\s*"live",\s*"manual",\s*"csv"\s*\]\s*\)\s*\)/,
    );
    // Never a hand-maintained raw literal list that could drift from the fence.
    expect(HOOK_SRC).not.toMatch(/\.in\(\s*["']source["']\s*,\s*\[/);
  });
});

describe("rawSensorSourceValuesFor — alias-table derivation", () => {
  it("covers every raw token the fence would admit and nothing demo/invalid", () => {
    const raws = rawSensorSourceValuesFor(["live", "manual", "csv"]);
    for (const alias of ["live", "sensor", "realtime", "manual", "user", "entry", "log", "csv", "import"]) {
      expect(raws).toContain(alias);
    }
    for (const excluded of ["demo", "mock", "sample", "fixture", "stale", "invalid", "unknown"]) {
      expect(raws).not.toContain(excluded);
    }
  });

  it("fence and pre-filter agree: every derived raw token passes the fence", () => {
    for (const raw of rawSensorSourceValuesFor(["live", "manual", "csv"])) {
      expect(
        isReportsHubSensorContextRow({ ts: "2026-07-17T10:00:00Z", source: raw }),
      ).toBe(true);
    }
    expect(
      isReportsHubSensorContextRow({ ts: "2026-07-17T10:00:00Z", source: "demo" }),
    ).toBe(false);
  });
});

describe("laterObservation — latest reading ignores database order", () => {
  it("prefers the physically later observation regardless of argument order", () => {
    expect(laterObservation("2026-07-16T10:00:00Z", "2026-07-17T10:00:00Z")).toBe(
      "2026-07-17T10:00:00Z",
    );
    expect(laterObservation("2026-07-17T10:00:00Z", "2026-07-16T10:00:00Z")).toBe(
      "2026-07-17T10:00:00Z",
    );
  });

  it("handles nulls and unparseable values without losing the known side", () => {
    expect(laterObservation(null, "2026-07-17T10:00:00Z")).toBe("2026-07-17T10:00:00Z");
    expect(laterObservation("2026-07-17T10:00:00Z", null)).toBe("2026-07-17T10:00:00Z");
    expect(laterObservation(null, null)).toBeNull();
    expect(laterObservation("2026-07-17T10:00:00Z", "not-a-date")).toBe(
      "2026-07-17T10:00:00Z",
    );
    expect(laterObservation("not-a-date", "2026-07-17T10:00:00Z")).toBe(
      "2026-07-17T10:00:00Z",
    );
  });

  it("summary loops accumulate via laterObservation, never first-row-wins", () => {
    expect(HOOK_SRC).not.toMatch(/latestSensorCapturedAt\s*\?\?=/);
    const uses = HOOK_SRC.match(/laterObservation\(/g) ?? [];
    // Comparator definition + recent-window loop + older-history loop.
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });
});

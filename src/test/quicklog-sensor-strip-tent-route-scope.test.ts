/**
 * Quick Log sensor strip — tent-scoped Sensors handoff.
 *
 * Live KEEP Skunk Gas (Codex 2026-09-10): SG-2 in Veg Tent B opened
 * Sensors "Edit manual readings" with Veg Tent A selected because strip
 * actions used unscoped `/sensors` / `/sensors#manual-reading`.
 *
 * Contract:
 *  - Valid tent → `/sensors?tentId=<id>&tentIntent=required` (+ `#manual-reading` for add/edit)
 *  - Non-default (non-first) tent is the selected target, not the first tent
 *  - Missing / malformed tent fail closed: required intent, no silent other-tent form
 */
import { describe, expect, it } from "vitest";
import {
  SENSORS_TENT_INTENT_MODE_QUERY_PARAM,
  SENSORS_TENT_INTENT_MODE_REQUIRED,
  SENSORS_TENT_INTENT_QUERY_PARAM,
  readSensorsTentRouteIntent,
  resolveSensorsTentRouteSelection,
} from "@/lib/sensorRouteTentIntentRules";
import {
  buildQuickLogSnapshotStrip,
  buildQuickLogStripFromTentState,
  buildQuickLogStripSensorsHref,
} from "@/lib/quickLogSnapshotStripAdapter";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSnapshot,
} from "@/lib/latestSensorSnapshotRules";

/** Veg Tent A — first tent in the grower's list (wrong default). */
const TENT_A = "0094303d-5f4a-444a-8fd2-878dd57be453";
/** Veg Tent B — intended tent for plant SG-2. */
const TENT_B = "604edf84-1040-40e2-a31e-cf67640a981e";

const NOW = new Date("2026-09-10T19:00:00Z");
const TENTS = [{ id: TENT_A }, { id: TENT_B }];

function expectedScopedHref(tentId: string, hash?: "#manual-reading"): string {
  const search = new URLSearchParams();
  search.set(SENSORS_TENT_INTENT_QUERY_PARAM, tentId);
  search.set(SENSORS_TENT_INTENT_MODE_QUERY_PARAM, SENSORS_TENT_INTENT_MODE_REQUIRED);
  return `/sensors?${search.toString()}${hash ?? ""}`;
}

function intentFromHref(href: string) {
  return readSensorsTentRouteIntent(new URL(href, "https://verdant.test").searchParams);
}

function legacyStale(tentSource?: Partial<SensorSnapshot>): SensorSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    source: "live",
    ts: "2026-09-08T19:00:00Z",
    temp: 24,
    rh: 55,
    vpd: 1.1,
    ...tentSource,
  };
}

function strictManual(): StrictSnapshot {
  return {
    ...EMPTY_SENSOR_SNAPSHOT,
    status: "fresh_non_live",
    source: "manual",
    captured_at: "2026-09-10T18:50:00Z",
    age_minutes: 10,
    freshness: "fresh",
    badge_label: "manual • as of 10 min ago",
    metrics: { temp_f: 75.2, humidity_pct: 55, vpd_kpa: 1.32 },
  } as StrictSnapshot;
}

describe("buildQuickLogStripSensorsHref", () => {
  it("scopes a non-default tent with exact-match intent (Veg B, not Veg A)", () => {
    const href = buildQuickLogStripSensorsHref(TENT_B, { hash: "manual-reading" });
    expect(href).toBe(expectedScopedHref(TENT_B, "#manual-reading"));
    expect(href).toContain(TENT_B);
    expect(href).not.toContain(TENT_A);
    expect(href).toContain(
      `${SENSORS_TENT_INTENT_MODE_QUERY_PARAM}=${SENSORS_TENT_INTENT_MODE_REQUIRED}`,
    );
    expect(href.endsWith("#manual-reading")).toBe(true);

    expect(
      resolveSensorsTentRouteSelection({
        intent: intentFromHref(href),
        currentTentId: TENT_A,
        tents: TENTS,
      }),
    ).toBe(TENT_B);
  });

  it("fails closed for missing, malformed, and unavailable tents — never selects another tent", () => {
    for (const tentId of [null, undefined, "", "t1", "not-a-persisted-tent", " Veg Tent B "]) {
      const href = buildQuickLogStripSensorsHref(tentId, { hash: "manual-reading" });
      expect(href.startsWith("/sensors?")).toBe(true);
      expect(href).not.toContain(TENT_A);
      expect(href).not.toContain(TENT_B);
      expect(href).not.toBe("/sensors");
      expect(href).not.toBe("/sensors#manual-reading");

      const intent = intentFromHref(href);
      expect(intent.requireExactMatch).toBe(true);
      expect(intent.tentId).toBeNull();
      expect(
        resolveSensorsTentRouteSelection({
          intent,
          currentTentId: TENT_A,
          tents: TENTS,
        }),
      ).toBeNull();
    }
  });
});

describe("quickLogSnapshotStripAdapter — outgoing actions carry tent scope", () => {
  it("legacy refresh/review/add use the strip tent, not unscoped /sensors", () => {
    const stale = buildQuickLogSnapshotStrip({
      snapshot: legacyStale(),
      hasTent: true,
      tentId: TENT_B,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(stale.action.kind).toBe("refresh");
    if (stale.action.kind !== "none") {
      expect(stale.action.href).toBe(expectedScopedHref(TENT_B));
    }

    const invalid = buildQuickLogSnapshotStrip({
      snapshot: legacyStale({ source: "sim" }),
      hasTent: true,
      tentId: TENT_B,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(invalid.action.kind).toBe("review");
    if (invalid.action.kind !== "none") {
      expect(invalid.action.href).toBe(expectedScopedHref(TENT_B));
    }

    const add = buildQuickLogSnapshotStrip({
      snapshot: null,
      hasTent: true,
      tentId: TENT_B,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(add.action.kind).toBe("add");
    if (add.action.kind !== "none") {
      expect(add.action.href).toBe(expectedScopedHref(TENT_B, "#manual-reading"));
    }
  });

  it("strict edit action retains Veg B, not the first tent", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: strictManual(),
      hasTent: true,
      tentId: TENT_B,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(v.action.kind).toBe("edit");
    if (v.action.kind === "edit") {
      expect(v.action.href).toBe(expectedScopedHref(TENT_B, "#manual-reading"));
      expect(v.action.href).not.toContain(TENT_A);
    }
  });

  it("malformed tent on add/edit cannot silently open another tent's form", () => {
    const add = buildQuickLogSnapshotStrip({
      snapshot: null,
      hasTent: false,
      tentId: "t1",
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(add.action.kind).toBe("add");
    if (add.action.kind !== "none") {
      expect(add.action.href).not.toBe("/sensors#manual-reading");
      expect(
        resolveSensorsTentRouteSelection({
          intent: intentFromHref(add.action.href),
          currentTentId: TENT_A,
          tents: TENTS,
        }),
      ).toBeNull();
    }

    const edit = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: strictManual(),
      hasTent: true,
      tentId: "not-a-uuid",
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(edit.action.kind).toBe("edit");
    if (edit.action.kind !== "none") {
      expect(edit.action.href).not.toBe("/sensors#manual-reading");
      expect(
        resolveSensorsTentRouteSelection({
          intent: intentFromHref(edit.action.href),
          currentTentId: TENT_A,
          tents: TENTS,
        }),
      ).toBeNull();
    }
  });
});

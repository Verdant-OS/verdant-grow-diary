/**
 * Grow Room Mode quick-action launcher — pure helper + static-safety tests.
 *
 * Covers:
 *  - all 5 launcher entries render in deterministic order
 *  - QuickLog entry uses the existing `verdant:open-quicklog` event (no href)
 *  - Sensor / Doctor / Alerts / Outcome entries route to the expected paths
 *  - scoped grow id is preserved in scoped routes (sensors, alerts, dashboard)
 *  - missing grow scope falls back to base routes (no broken URLs)
 *  - Record-outcome entry is omitted when surface is unavailable
 *  - Copy avoids autopilot / control / guaranteed / fixed language
 *  - Helper module is pure: no React, no Supabase, no fetch, no service_role,
 *    no device-control strings
 *  - Page integration: GrowRoomMode renders the launcher and does not
 *    duplicate routing logic in JSX
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildGrowRoomLauncherEntries,
  type GrowRoomLauncherKind,
} from "@/lib/growRoomQuickActionLauncher";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

const ROOT = resolve(__dirname, "../..");
const HELPER = readFileSync(
  resolve(ROOT, "src/lib/growRoomQuickActionLauncher.ts"),
  "utf8",
);
const CARD = readFileSync(
  resolve(ROOT, "src/components/GrowRoomQuickActionsCard.tsx"),
  "utf8",
);
const PAGE = readFileSync(resolve(ROOT, "src/pages/GrowRoomMode.tsx"), "utf8");

const FORBIDDEN_COPY = [
  /autopilot/i,
  /\bauto[-\s]?(execute|run|control)\b/i,
  /\bguaranteed\b/i,
  /\bfixed\b/i,
  /\bhealthy\b/i,
  /\bbest\b/i,
  /\bworst\b/i,
];

describe("buildGrowRoomLauncherEntries · ordering and completeness", () => {
  it("returns the 5 expected kinds in deterministic order when outcome is available", () => {
    const kinds = buildGrowRoomLauncherEntries({ scopedGrowId: null }).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual([
      "quicklog",
      "manual_sensor_snapshot",
      "ask_doctor",
      "review_alerts",
      "record_outcome",
    ] satisfies GrowRoomLauncherKind[]);
  });

  it("omits record_outcome gracefully when surface is unavailable", () => {
    const kinds = buildGrowRoomLauncherEntries({
      scopedGrowId: null,
      recordOutcomeAvailable: false,
    }).map((e) => e.kind);
    expect(kinds).not.toContain("record_outcome");
    expect(kinds).toHaveLength(4);
  });
});

describe("buildGrowRoomLauncherEntries · routing", () => {
  it("QuickLog uses the existing open-quicklog event (no href)", () => {
    const ql = buildGrowRoomLauncherEntries({ scopedGrowId: null }).find(
      (e) => e.kind === "quicklog",
    )!;
    expect(ql.event).toBe("open-quicklog");
    expect(ql.href).toBeUndefined();
    // Sanity: the event constant matches the global listener key.
    expect(PLANT_QUICKLOG_PREFILL_EVENT).toBe("verdant:open-quicklog");
  });

  it("Ask Doctor routes to /doctor", () => {
    const ad = buildGrowRoomLauncherEntries({ scopedGrowId: null }).find(
      (e) => e.kind === "ask_doctor",
    )!;
    expect(ad.href).toBe("/doctor");
  });

  it("Sensor / Alerts / Outcome use base routes when no grow is scoped", () => {
    const entries = buildGrowRoomLauncherEntries({ scopedGrowId: null });
    const byKind = Object.fromEntries(entries.map((e) => [e.kind, e]));
    expect(byKind.manual_sensor_snapshot.href).toBe("/sensors");
    expect(byKind.review_alerts.href).toBe("/alerts");
    expect(byKind.record_outcome.href).toBe("/dashboard");
  });

  it("preserves scoped growId in scoped routes", () => {
    const entries = buildGrowRoomLauncherEntries({ scopedGrowId: "grow-1" });
    const byKind = Object.fromEntries(entries.map((e) => [e.kind, e]));
    expect(byKind.manual_sensor_snapshot.href).toBe("/sensors?growId=grow-1");
    expect(byKind.review_alerts.href).toBe("/alerts?growId=grow-1");
    expect(byKind.record_outcome.href).toBe("/dashboard?growId=grow-1");
    // Doctor route is not grow-scoped today; must not invent a param.
    expect(byKind.ask_doctor.href).toBe("/doctor");
  });

  it("URL-encodes hostile grow ids without throwing", () => {
    const entries = buildGrowRoomLauncherEntries({
      scopedGrowId: "a b/c?d",
    });
    const sensors = entries.find((e) => e.kind === "manual_sensor_snapshot")!;
    expect(sensors.href).toContain("growId=a%20b%2Fc%3Fd");
  });

  it("each entry has a stable testId", () => {
    for (const e of buildGrowRoomLauncherEntries({ scopedGrowId: null })) {
      expect(e.testId).toMatch(/^grow-room-launcher-/);
    }
  });
});

describe("buildGrowRoomLauncherEntries · copy hygiene", () => {
  it("labels and descriptions avoid autopilot / control / certainty language", () => {
    for (const e of buildGrowRoomLauncherEntries({ scopedGrowId: null })) {
      for (const re of FORBIDDEN_COPY) {
        expect(`${e.label} ${e.description}`).not.toMatch(re);
      }
    }
  });
});

describe("growRoomQuickActionLauncher.ts · static safety (helper is pure)", () => {
  it("does not import React, hooks, or Supabase", () => {
    expect(HELPER).not.toMatch(/from\s+["']react["']/);
    expect(HELPER).not.toMatch(/@tanstack\/react-query/);
    expect(HELPER).not.toMatch(/@\/integrations\/supabase/);
  });

  it("performs no I/O", () => {
    expect(HELPER).not.toMatch(/\bfetch\(/);
    expect(HELPER).not.toMatch(/\.from\(/);
    expect(HELPER).not.toMatch(/\.rpc\(/);
  });

  it("contains no automation / device-control / service_role strings", () => {
    for (const re of [
      /service_role/i,
      /mqtt/i,
      /home[\s_-]?assistant/i,
      /pi[\s_-]?bridge/i,
      /\brelay\b/i,
      /\bactuator\b/i,
      /webhook/i,
      /device[_-]?command/i,
      /auto[_-]?(approve|reject|cancel|create|execute)/i,
    ]) {
      expect(HELPER).not.toMatch(re);
      expect(CARD).not.toMatch(re);
    }
  });

  it("does not touch alert / sensor-ingest write surfaces", () => {
    expect(HELPER).not.toMatch(/usePersistEnvironmentAlerts/);
    expect(HELPER).not.toMatch(/sensor-ingest/i);
    expect(HELPER).not.toMatch(/pi-ingest/i);
    expect(CARD).not.toMatch(/usePersistEnvironmentAlerts/);
    expect(CARD).not.toMatch(/sensor-ingest/i);
    expect(CARD).not.toMatch(/pi-ingest/i);
  });
});

describe("GrowRoomQuickActionsCard · render integration", () => {
  it("imports the pure launcher helper (no duplicate routing in JSX)", () => {
    expect(CARD).toMatch(/buildGrowRoomLauncherEntries/);
    // Card must not hand-roll the routes itself.
    expect(CARD).not.toMatch(/["']\/sensors\?growId=/);
    expect(CARD).not.toMatch(/["']\/alerts\?growId=/);
    expect(CARD).not.toMatch(/["']\/dashboard\?growId=/);
  });

  it("dispatches the existing open-quicklog event constant", () => {
    expect(CARD).toMatch(/PLANT_QUICKLOG_PREFILL_EVENT/);
    expect(CARD).toMatch(/new CustomEvent\(\s*PLANT_QUICKLOG_PREFILL_EVENT/);
  });

  it("performs no writes from the launcher", () => {
    for (const re of [/\.insert\(/, /\.update\(/, /\.delete\(/, /\.upsert\(/, /\.rpc\(/]) {
      expect(CARD).not.toMatch(re);
    }
  });
});

describe("GrowRoomMode page · launcher wiring", () => {
  it("renders GrowRoomQuickActionsCard with the scoped growId", () => {
    expect(PAGE).toMatch(
      /import\s+GrowRoomQuickActionsCard\s+from\s+["']@\/components\/GrowRoomQuickActionsCard["']/,
    );
    expect(PAGE).toMatch(/<GrowRoomQuickActionsCard\s+scopedGrowId=\{urlGrowId\}/);
  });

  it("uses the shared useScopedGrow hook for scope (no duplicated URL parsing)", () => {
    expect(PAGE).toMatch(
      /from\s+["']@\/hooks\/useScopedGrow["']/,
    );
  });
});

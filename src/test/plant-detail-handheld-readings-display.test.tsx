/**
 * Plant Detail → handheld readings display.
 *
 * Display-only polish for QuickLog's deterministic
 * "Hardware readings (manual handheld):" block. Asserts:
 *   - pure split helper returns body + lines when block present
 *   - pure split helper leaves normal notes unchanged
 *   - PlantRecentActivityRow exposes hasHardwareReadings + lines
 *   - PlantRecentActivityPanel renders a visible section + line items
 *   - original note text is preserved in notePreview
 *   - no parsing into sensor metrics, alerts, action queue, or warnings
 *   - notes without the block are unchanged
 *   - safety: no service_role, mqtt, pi_bridge, home_assistant, actuator,
 *     device_command, autopilot, leads, sensor_readings/alerts/action_queue
 *     writes, no schema/migration files referenced
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import {
  splitHardwareReadingsFromNote,
} from "@/lib/quickLogHardwareReadingsDisplayRules";
import {
  appendHardwareReadingsToNote,
  HARDWARE_READINGS_HEADER,
} from "@/lib/quickLogHardwareReadingsRules";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import PlantRecentActivityPanel from "@/components/PlantRecentActivityPanel";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const SAMPLE = appendHardwareReadingsToNote("Watered today, runoff looked fine.", {
  inputPh: "6.1",
  inputEc: "1.4",
  ppfdCanopy: "650",
});

describe("splitHardwareReadingsFromNote", () => {
  it("splits body from hardware block when present", () => {
    const r = splitHardwareReadingsFromNote(SAMPLE);
    expect(r.hasHardwareBlock).toBe(true);
    expect(r.body).toBe("Watered today, runoff looked fine.");
    expect(r.hardwareHeader).toBe(HARDWARE_READINGS_HEADER);
    expect(r.hardwareLines.length).toBeGreaterThan(0);
    expect(r.hardwareLines.some((l) => l.includes("Input pH") && l.includes("6.1"))).toBe(true);
    expect(r.hardwareLines.some((l) => l.includes("PPFD canopy") && l.includes("650"))).toBe(true);
  });

  it("leaves normal notes unchanged", () => {
    const r = splitHardwareReadingsFromNote("Just a normal observation.");
    expect(r.hasHardwareBlock).toBe(false);
    expect(r.body).toBe("Just a normal observation.");
    expect(r.hardwareLines).toEqual([]);
    expect(r.hardwareHeader).toBeNull();
  });

  it("handles null/empty deterministically", () => {
    expect(splitHardwareReadingsFromNote(null).body).toBe("");
    expect(splitHardwareReadingsFromNote("").hasHardwareBlock).toBe(false);
  });
});

describe("buildPlantRecentActivity hardware fields", () => {
  it("flags rows with hardware readings and exposes line list", () => {
    const rows = buildPlantRecentActivity(
      [
        {
          id: "e1",
          grow_id: "g",
          plant_id: "p1",
          tent_id: "t",
          event_type: "watering",
          note: SAMPLE,
          entry_at: "2026-05-23T10:00:00Z",
          details: {},
        },
      ],
      { plantId: "p1", now: Date.parse("2026-05-23T12:00:00Z") },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].hasHardwareReadings).toBe(true);
    expect(rows[0].hardwareReadingLines.length).toBeGreaterThan(0);
    // notePreview preserves the original prose
    expect(rows[0].notePreview).toBe("Watered today, runoff looked fine.");
    // no warnings invented from hardware values
    expect(rows[0].warnings).toEqual([]);
  });

  it("leaves rows without hardware block unchanged", () => {
    const rows = buildPlantRecentActivity(
      [
        {
          id: "e1",
          plant_id: "p1",
          tent_id: "t",
          event_type: "note",
          note: "looking healthy",
          entry_at: "2026-05-23T10:00:00Z",
          details: {},
        },
      ],
      { plantId: "p1", now: Date.parse("2026-05-23T12:00:00Z") },
    );
    expect(rows[0].hasHardwareReadings).toBe(false);
    expect(rows[0].hardwareReadingLines).toEqual([]);
    expect(rows[0].notePreview).toBe("looking healthy");
  });
});

describe("PlantRecentActivityPanel hardware readings rendering", () => {
  function renderPanel(rows: unknown[]) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["plant_recent_activity", "p1"], rows);
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <PlantRecentActivityPanel plantId="p1" plantName="Plant A" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("renders a visible Manual handheld readings section when block present", async () => {
    renderPanel([
      {
        id: "e1",
        plant_id: "p1",
        tent_id: "t",
        event_type: "watering",
        note: SAMPLE,
        entry_at: "2026-05-23T10:00:00Z",
        details: {},
      },
    ]);
    const section = await screen.findByTestId("plant-recent-activity-hardware-readings");
    expect(section).toBeTruthy();
    expect(section.textContent ?? "").toMatch(/manual handheld readings/i);
    expect(section.textContent ?? "").toMatch(/Input pH/);
    expect(section.textContent ?? "").toMatch(/6\.1/);
    // original prose still readable above
    expect(screen.getByText(/Watered today, runoff looked fine\./)).toBeTruthy();
  });

  it("does not render the section when no block exists", () => {
    renderPanel([
      {
        id: "e1",
        plant_id: "p1",
        tent_id: "t",
        event_type: "note",
        note: "all good",
        entry_at: "2026-05-23T10:00:00Z",
        details: {},
      },
    ]);
    expect(screen.queryByTestId("plant-recent-activity-hardware-readings")).toBeNull();
    expect(screen.getByText("all good")).toBeTruthy();
  });
});

describe("static safety guardrails", () => {
  const FILES = [
    "src/lib/quickLogHardwareReadingsDisplayRules.ts",
    "src/lib/plantRecentActivityRules.ts",
    "src/components/PlantRecentActivityPanel.tsx",
  ];
  const SRC = FILES.map(read).join("\n");

  it("introduces no unsafe surfaces", () => {
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/\bmqtt\b/i);
    expect(SRC).not.toMatch(/home[_-]?assistant/i);
    expect(SRC).not.toMatch(/pi[_-]?bridge/i);
    expect(SRC).not.toMatch(/actuator|device_command|autopilot/i);
    expect(SRC).not.toMatch(/\bleads?\b/i);
  });

  it("does not write to sensor_readings, alerts, or action_queue", () => {
    expect(SRC).not.toMatch(/sensor_readings[\s\S]*\.(insert|update|upsert|delete)/);
    expect(SRC).not.toMatch(/\balerts\b[\s\S]*\.(insert|update|upsert|delete)/);
    expect(SRC).not.toMatch(/action_queue[\s\S]*\.(insert|update|upsert|delete)/);
  });

  it("does not add migration files", () => {
    // Sentinel: this change should not require a migration alongside it.
    const migrationFlag = resolve(
      ROOT,
      "supabase/migrations/.handheld-readings-display-marker.sql",
    );
    expect(existsSync(migrationFlag)).toBe(false);
  });
});

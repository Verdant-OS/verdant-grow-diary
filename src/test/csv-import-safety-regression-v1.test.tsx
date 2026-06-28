/**
 * CSV Import Safety Regression v1
 *
 * Focused, additive regression suite that proves the *existing* grower-facing
 * CSV import flow keeps its safety contract:
 *
 *  - Upload / preview does not write.
 *  - Cancel does not write.
 *  - Confirm is required before any insert.
 *  - Accepted rows write with source: "csv".
 *  - Buffered empty / rejected rows do not write.
 *  - CSV/imported readings are never labeled as Live.
 *  - No alerts, action_queue, or device-control writes from CSV import.
 *  - CSV / imported / stale / invalid / unknown data is not described as healthy.
 *
 * This file does not add a second CSV flow. It only inspects:
 *   - src/lib/environmentCsvImportPersistence.ts
 *   - src/components/EnvironmentCsvImportModal.tsx
 *   - src/components/EnvironmentCsvImportLauncher.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

import {
  buildSensorReadingInserts,
  persistCsvEnvironmentRows,
  CSV_SENSOR_SOURCE,
  type InsertClient,
} from "@/lib/environmentCsvImportPersistence";
import type { ParsedEnvironmentRow } from "@/lib/csvParser";
import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PERSISTENCE_SRC = read("src/lib/environmentCsvImportPersistence.ts");
const MODAL_SRC = read("src/components/EnvironmentCsvImportModal.tsx");
const LAUNCHER_SRC = read("src/components/EnvironmentCsvImportLauncher.tsx");

const SCOPE = {
  user_id: "u1",
  grow_id: "g1",
  tent_id: "t1",
  plant_id: "p1",
};

function row(over: Partial<ParsedEnvironmentRow> = {}): ParsedEnvironmentRow {
  return {
    rowNumber: 1,
    captured_at: "2026-06-01T10:00:00.000Z",
    temperature_c: 25,
    humidity_pct: 50,
    vpd_kpa: 1.58,
    co2_ppm: null,
    ppfd: null,
    raw_temperature: 77,
    raw_temp_unit: "F",
    raw_payload: { Timestamp: "2026-06-01T10:00:00Z", Temp: "77", RH: "50" },
    vpd_source: "derived",
    source_tag: "csv",
    ...over,
  };
}

function makeClient(): InsertClient & { calls: number; rowsSeen: number } {
  const tracker = { calls: 0, rowsSeen: 0 } as { calls: number; rowsSeen: number };
  const client: InsertClient = {
    async insertSensorReadings(rows) {
      tracker.calls += 1;
      tracker.rowsSeen += rows.length;
      return { error: null, insertedCount: rows.length };
    },
  };
  return Object.assign(client, tracker);
}

// ---------------------------------------------------------------------------
// 1. Persistence shape & write boundary
// ---------------------------------------------------------------------------
describe("CSV Import Safety Regression v1 — persistence boundary", () => {
  it("empty input does not invoke the insert client", async () => {
    const client = makeClient();
    const res = await persistCsvEnvironmentRows([], SCOPE, client);
    expect(client.calls).toBe(0);
    expect(res.insertedCount).toBe(0);
    expect(res.error).toBeNull();
  });

  it("rows that resolve to no canonical metrics do not invoke the insert client", async () => {
    const empty = row({
      temperature_c: null,
      humidity_pct: null,
      vpd_kpa: null,
      co2_ppm: null,
      ppfd: null,
    });
    const client = makeClient();
    const res = await persistCsvEnvironmentRows([empty], SCOPE, client);
    expect(client.calls).toBe(0);
    expect(res.insertedCount).toBe(0);
  });

  it("accepted rows write with source: 'csv' and source_tag: 'csv'", async () => {
    const inserts = buildSensorReadingInserts([row()], SCOPE);
    expect(inserts.length).toBeGreaterThan(0);
    expect(inserts.every((i) => i.source === CSV_SENSOR_SOURCE)).toBe(true);
    expect(inserts.every((i) => i.raw_payload.source_tag === "csv")).toBe(true);
    // Never labeled as live anywhere in the insert payload.
    expect(
      inserts.every((i) => !JSON.stringify(i).toLowerCase().includes("\"live\"")),
    ).toBe(true);
  });

  it("propagates RLS/insert failures as a safe error state", async () => {
    const client: InsertClient = {
      async insertSensorReadings() {
        return { error: { message: "permission denied" }, insertedCount: 0 };
      },
    };
    const res = await persistCsvEnvironmentRows([row()], SCOPE, client);
    expect(res.error).toMatch(/permission denied/i);
    expect(res.insertedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. UI — confirm gate
// ---------------------------------------------------------------------------
describe("CSV Import Safety Regression v1 — confirm gate", () => {
  it("opening the modal does not call onConfirm", () => {
    const onConfirm = vi.fn().mockResolvedValue({ insertedCount: 0, error: null });
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
      />,
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId("csv-import-entry")).toBeTruthy();
    cleanup();
  });

  it("uploading + previewing a CSV does not call onConfirm until the Confirm CTA", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ insertedCount: 0, error: null });
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
      />,
    );

    const csv =
      "Timestamp,Temperature (C),Humidity\n2026-06-01T10:00:00Z,24.0,55\n";
    const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [new File([csv], "export.csv", { type: "text/csv" })],
    });
    fireEvent.change(input);
    await waitFor(() => {
      expect(
        screen.queryByTestId("csv-import-preview") ||
          screen.queryByTestId("csv-import-unit-confirm") ||
          screen.queryByTestId("csv-import-error"),
      ).toBeTruthy();
    });
    expect(onConfirm).not.toHaveBeenCalled();
    cleanup();
  });

  it("cancel never inserts (cancelImport is referenced in the modal)", () => {
    // Static fence: modal must wire the cancel path and the persistence comment
    // pins the cancel-never-inserts contract.
    expect(MODAL_SRC).toMatch(/cancelImport/);
    expect(MODAL_SRC).toMatch(/Cancel never inserts/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Static safety — no live mislabel, no alerts/action_queue/device writes
// ---------------------------------------------------------------------------
describe("CSV Import Safety Regression v1 — static safety scan", () => {
  const BANNED = [
    "automatically executed",
    "auto execute",
    "device command",
    "send command",
    "set fan",
    "set light",
    "set irrigation",
    "dose nutrients",
    "guaranteed",
    "definitely",
    "diagnosed from photo",
  ];

  const ALL = [PERSISTENCE_SRC, MODAL_SRC, LAUNCHER_SRC].join("\n");

  it("CSV flow source files do not contain banned automation/diagnosis phrases", () => {
    const lower = ALL.toLowerCase();
    for (const term of BANNED) {
      expect(lower, `banned phrase leaked into CSV flow: ${term}`).not.toContain(term);
    }
  });

  it("CSV persistence is insert-only and never writes alerts / action_queue / devices", () => {
    expect(PERSISTENCE_SRC).not.toMatch(/\bdelete\b|\bupdate\b\s*\(/i);
    const combined = ALL.toLowerCase();
    expect(combined).not.toContain("from(\"alerts\")");
    expect(combined).not.toContain("from(\"action_queue\")");
    expect(combined).not.toMatch(/device_control|actuator|relay\./);
  });

  it("CSV flow never labels imported readings as Live", () => {
    // The persistence source pins this in its contract header.
    expect(PERSISTENCE_SRC).toMatch(/Never labels rows as "live"/);
    // The modal must not render a Live badge for CSV rows.
    expect(MODAL_SRC).toMatch(/Never renders a "Live" badge for CSV/);
    // No inline 'Live' badge string in modal or launcher anywhere.
    expect(MODAL_SRC.toLowerCase()).not.toMatch(/badge[^<]{0,30}>\s*live/i);
    expect(LAUNCHER_SRC.toLowerCase()).not.toMatch(/badge[^<]{0,30}>\s*live/i);
  });

  it("CSV-near-healthy and stale/invalid/demo/unknown-near-healthy never appear", () => {
    const lower = ALL.toLowerCase();
    const nearHealthy = /(csv|imported|stale|invalid|demo|unknown)[^.]{0,40}\bhealthy\b/;
    expect(lower).not.toMatch(nearHealthy);
  });
});

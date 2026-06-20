import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SENSOR_HISTORY_CANONICAL_SOURCE_LABEL,
  SENSOR_HISTORY_IMPORT_AUDIT_STORAGE_KEY,
  clearSensorHistoryImportAuditEvents,
  getRecentSensorHistoryImportAuditEvents,
  readSensorHistoryImportAuditEvents,
  recordSensorHistoryImportAuditEvent,
  type SensorHistoryImportAuditOptions,
} from "@/lib/sensorHistoryImportAuditLog";
import {
  SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_DISCLAIMER,
  SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_EMPTY,
  SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_TITLE,
  SensorHistoryImportAuditLedger,
} from "@/components/SensorHistoryImportAuditLedger";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
  } as Storage;
}

function makeOpts(t: number): SensorHistoryImportAuditOptions {
  const storage = memStorage();
  let i = 0;
  return {
    storage,
    now: () => new Date(t + i * 1000),
    idFactory: () => `id-${++i}`,
  };
}

describe("sensorHistoryImportAuditLog", () => {
  beforeEach(() => {
    // Ensure global storage is clean for default-path tests.
    clearSensorHistoryImportAuditEvents();
  });

  it("records a Verdant Genetics XLSX import event", () => {
    const opts = makeOpts(Date.UTC(2026, 5, 1, 12));
    const evt = recordSensorHistoryImportAuditEvent(
      {
        sourceAppId: "verdant_genetics_xlsx",
        fileType: "xlsx",
        acceptedRowCount: 120,
        rejectedRowCount: 3,
        dateRange: { start: "2026-05-01", end: "2026-05-31" },
        mappedTentLabels: ["Tent A"],
        mappedSensorGroups: ["Group 1"],
      },
      opts,
    );
    expect(evt?.sourceAppLabel).toBe("Verdant Genetics XLSX");
    expect(evt?.canonicalSourceLabel).toBe(
      SENSOR_HISTORY_CANONICAL_SOURCE_LABEL,
    );
    const all = readSensorHistoryImportAuditEvents(opts);
    expect(all).toHaveLength(1);
  });

  it("records Spider Farmer and Vivosun CSV import events", () => {
    const opts = makeOpts(Date.UTC(2026, 5, 2, 9));
    recordSensorHistoryImportAuditEvent(
      {
        sourceAppId: "spider_farmer",
        fileType: "csv",
        acceptedRowCount: 50,
        rejectedRowCount: 0,
      },
      opts,
    );
    recordSensorHistoryImportAuditEvent(
      {
        sourceAppId: "vivosun",
        fileType: "csv",
        acceptedRowCount: 80,
        rejectedRowCount: 2,
      },
      opts,
    );
    const all = readSensorHistoryImportAuditEvents(opts);
    expect(all.map((e) => e.sourceAppId)).toEqual([
      "spider_farmer",
      "vivosun",
    ]);
    expect(all[0].sourceAppLabel).toBe("Spider Farmer CSV");
    expect(all[1].sourceAppLabel).toBe("Vivosun CSV");
  });

  it("sanitizes input — does not store private/forbidden fields", () => {
    const opts = makeOpts(Date.UTC(2026, 5, 3));
    recordSensorHistoryImportAuditEvent(
      {
        sourceAppId: "spider_farmer",
        fileType: "csv",
        acceptedRowCount: -5, // clamped
        rejectedRowCount: Number.NaN, // clamped to 0
      } as never,
      opts,
    );
    const stored = opts.storage!.getItem(
      SENSOR_HISTORY_IMPORT_AUDIT_STORAGE_KEY,
    )!;
    expect(stored).not.toMatch(/raw_payload/i);
    expect(stored).not.toMatch(/raw_row/i);
    expect(stored).not.toMatch(/device_serial/i);
    expect(stored).not.toMatch(/bridge_token/i);
    expect(stored).not.toMatch(/service_role/i);
    expect(stored).not.toMatch(/import_batch_id/i);
    const evt = readSensorHistoryImportAuditEvents(opts)[0];
    expect(evt.acceptedRowCount).toBe(0);
    expect(evt.rejectedRowCount).toBe(0);
  });

  it("returns at most 10 events newest-first via getRecent", () => {
    const opts = makeOpts(Date.UTC(2026, 5, 4));
    for (let i = 0; i < 12; i++) {
      recordSensorHistoryImportAuditEvent(
        {
          sourceAppId: "spider_farmer",
          fileType: "csv",
          acceptedRowCount: i,
          rejectedRowCount: 0,
        },
        opts,
      );
    }
    const recent = getRecentSensorHistoryImportAuditEvents(10, opts);
    expect(recent).toHaveLength(10);
    // newest first → highest acceptedRowCount first
    expect(recent[0].acceptedRowCount).toBe(11);
    expect(recent[9].acceptedRowCount).toBe(2);
  });
});

describe("SensorHistoryImportAuditLedger component", () => {
  function seed(): SensorHistoryImportAuditOptions {
    const opts = makeOpts(Date.UTC(2026, 5, 5, 10));
    recordSensorHistoryImportAuditEvent(
      {
        sourceAppId: "verdant_genetics_xlsx",
        fileType: "xlsx",
        acceptedRowCount: 200,
        rejectedRowCount: 4,
        dateRange: { start: "2026-04-01", end: "2026-04-30" },
        mappedTentLabels: ["Tent A", "Tent B"],
        mappedSensorGroups: ["VG Group 1"],
      },
      opts,
    );
    recordSensorHistoryImportAuditEvent(
      {
        sourceAppId: "spider_farmer",
        fileType: "csv",
        acceptedRowCount: 33,
        rejectedRowCount: 1,
      },
      opts,
    );
    return opts;
  }

  it("renders empty-state copy when no events", () => {
    render(
      <SensorHistoryImportAuditLedger
        options={{ storage: memStorage(), now: () => new Date(), idFactory: () => "x" }}
      />,
    );
    expect(
      screen.getByText(SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_TITLE),
    ).toBeTruthy();
    expect(
      screen.getByText(SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_DISCLAIMER),
    ).toBeTruthy();
    expect(
      screen.getByText(SENSOR_HISTORY_IMPORT_AUDIT_LEDGER_EMPTY),
    ).toBeTruthy();
  });

  it("renders recent events with source label, CSV history, counts, range, tent/group labels", () => {
    const opts = seed();
    render(<SensorHistoryImportAuditLedger options={opts} />);
    const rows = screen.getAllByTestId(
      "sensor-history-import-audit-ledger-row",
    );
    expect(rows).toHaveLength(2);

    // newest-first → spider_farmer first
    expect(rows[0].getAttribute("data-source-app")).toBe("spider_farmer");
    expect(rows[1].getAttribute("data-source-app")).toBe(
      "verdant_genetics_xlsx",
    );

    const xlsxRow = rows[1];
    expect(within(xlsxRow).getByText(/Verdant Genetics XLSX/)).toBeTruthy();
    expect(
      within(xlsxRow).getByTestId("ledger-canonical-source").textContent,
    ).toBe("CSV history");
    expect(within(xlsxRow).getByTestId("ledger-file-type").textContent).toBe(
      "XLSX",
    );
    expect(
      within(xlsxRow).getByTestId("ledger-accepted-count").textContent,
    ).toMatch(/Accepted: 200/);
    expect(
      within(xlsxRow).getByTestId("ledger-rejected-count").textContent,
    ).toMatch(/Rejected: 4/);
    expect(
      within(xlsxRow).getByTestId("ledger-date-range").textContent,
    ).toMatch(/2026-04-01.*2026-04-30/);
    expect(
      within(xlsxRow).getByTestId("ledger-mapped-tents").textContent,
    ).toMatch(/Tent A, Tent B/);
    expect(
      within(xlsxRow).getByTestId("ledger-mapped-groups").textContent,
    ).toMatch(/VG Group 1/);
  });

  it("limits the rendered list to 10 events", () => {
    const opts = makeOpts(Date.UTC(2026, 5, 6));
    for (let i = 0; i < 15; i++) {
      recordSensorHistoryImportAuditEvent(
        {
          sourceAppId: "vivosun",
          fileType: "csv",
          acceptedRowCount: i,
          rejectedRowCount: 0,
        },
        opts,
      );
    }
    render(<SensorHistoryImportAuditLedger options={opts} />);
    expect(
      screen.getAllByTestId("sensor-history-import-audit-ledger-row"),
    ).toHaveLength(10);
  });

  it("does not render raw_payload, device serials, bridge tokens, or import batch IDs", () => {
    const opts = seed();
    const { container } = render(
      <SensorHistoryImportAuditLedger options={opts} />,
    );
    const txt = container.textContent ?? "";
    for (const forbidden of [
      "raw_payload",
      "raw_row",
      "device_serial",
      "bridge_token",
      "service_role",
      "import_batch_id",
      "supabase",
    ]) {
      expect(txt.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("renders inserted + skipped-duplicates counts when present and '—' when absent", () => {
    const opts = makeOpts(Date.UTC(2026, 6, 1, 9));
    // Event WITH duplicate-aware counts
    recordSensorHistoryImportAuditEvent(
      {
        sourceAppId: "verdant_genetics_xlsx",
        fileType: "xlsx",
        acceptedRowCount: 2266,
        rejectedRowCount: 0,
        insertedRowCount: 120,
        duplicateRowCount: 2146,
        mappedTentLabels: ["Tent A"],
      },
      opts,
    );
    // Event WITHOUT duplicate-aware counts (legacy / older event)
    recordSensorHistoryImportAuditEvent(
      {
        sourceAppId: "spider_farmer",
        fileType: "csv",
        acceptedRowCount: 30,
        rejectedRowCount: 0,
        mappedTentLabels: ["Tent B"],
      },
      opts,
    );
    render(<SensorHistoryImportAuditLedger options={opts} />);
    const rows = screen.getAllByTestId(
      "sensor-history-import-audit-ledger-row",
    );
    // newest first → spider_farmer (no counts), then xlsx (with counts)
    const legacyRow = rows[0];
    const newRow = rows[1];
    expect(
      within(newRow).getByTestId("ledger-inserted-count").textContent,
    ).toMatch(/Inserted:\s*120/);
    expect(
      within(newRow).getByTestId("ledger-duplicate-count").textContent,
    ).toMatch(/Skipped duplicates:\s*2146/);
    expect(
      within(legacyRow).getByTestId("ledger-inserted-count").textContent,
    ).toMatch(/Inserted:\s*—/);
    expect(
      within(legacyRow).getByTestId("ledger-duplicate-count").textContent,
    ).toMatch(/Skipped duplicates:\s*—/);
    // No-live disclaimer always present.
    expect(
      screen.getByText(/not live telemetry/i),
    ).toBeInTheDocument();
  });
});

describe("sensorHistoryImportAuditLog + ledger — static safety guard", () => {
  const root = resolve(__dirname, "..", "..");
  const files = [
    "src/lib/sensorHistoryImportAuditLog.ts",
    "src/components/SensorHistoryImportAuditLedger.tsx",
  ];

  it("does not import Supabase, write alerts, or call AI/devices", () => {
    for (const rel of files) {
      const src = readFileSync(resolve(root, rel), "utf8");
      expect(src).not.toMatch(/@\/integrations\/supabase\/client/);
      expect(src).not.toMatch(/from\s+["']@supabase/);
      expect(src).not.toMatch(/\.from\(\s*["'](alerts|action_queue)["']\s*\)/);
      expect(src).not.toMatch(/\.(insert|update|delete|upsert|rpc)\s*\(/);
      expect(src).not.toMatch(/fetch\s*\(/);
      expect(src).not.toMatch(/ai-doctor-review|ai-coach/);
      expect(src).not.toMatch(/device[_-]?control/i);
      expect(src).not.toMatch(/service_role/);
    }
  });
});

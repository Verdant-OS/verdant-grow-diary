/**
 * Sensor normalization preview — consolidated no-write guard.
 *
 * Cross-cutting integration test that proves both preview surfaces
 * (CSV import preview gate + Quick Log Environment Check compact
 * preview) are strictly read-only:
 *
 *   - render with data-writes-enabled="false"
 *   - never call Supabase write helpers (insert/upsert/update/delete/upload)
 *   - never call functions.invoke
 *   - never write to action_queue or alerts
 *   - never trigger the Quick Log save mock
 *   - never add normalized long-form rows to the save payload
 *   - never persist an EC@25°C preview as canonical sensor data
 *   - leave the disabled CSV import CTA disabled
 *   - never render the preview for note-only Environment Check entries
 *
 * Plus a focused static safety scan over preview-related files.
 *
 * Tests-only. No production changes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CsvPreviewReviewGate } from "@/components/CsvPreviewReviewGate";
import {
  parseDelimitedSensorPreview,
  type CsvPreviewParseResult,
} from "@/lib/csvSensorPreviewRules";
import { renderQuickLogEnvironmentCheck } from "./helpers/quickLogEnvironmentCheckTestHelper";

// ---------------------------------------------------------------------------
// Supabase / Quick Log mocks (hoisted)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const saveMock = vi.fn();
  const insertMock = vi.fn();
  const upsertMock = vi.fn();
  const updateMock = vi.fn();
  const deleteMock = vi.fn();
  const uploadMock = vi.fn();
  const invokeMock = vi.fn();
  const fromSpy = vi.fn((_table: string) => ({
    insert: insertMock,
    upsert: upsertMock,
    update: () => ({ eq: updateMock }),
    delete: () => ({ eq: deleteMock }),
    select: () => ({
      eq: () => ({
        order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
  }));
  return {
    saveMock,
    insertMock,
    upsertMock,
    updateMock,
    deleteMock,
    uploadMock,
    invokeMock,
    fromSpy,
  };
});

const {
  saveMock,
  insertMock,
  upsertMock,
  updateMock,
  deleteMock,
  uploadMock,
  invokeMock,
  fromSpy,
} = mocks;

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: (...a: unknown[]) => mocks.saveMock(...a),
    saving: false,
    error: null,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => mocks.fromSpy(table),
    storage: { from: () => ({ upload: mocks.uploadMock, remove: vi.fn() }) },
    functions: { invoke: mocks.invokeMock },
  },
}));


vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Test Grow", stage: "veg" }],
    activeGrow: { id: "grow-1", name: "Test Grow", stage: "veg" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "Verdant Test Plant", tent_id: "tent-1", grow_id: "grow-1" },
    ],
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date("2026-06-04T12:00:00.000Z");
const TENT_UUID = "11111111-2222-4333-8444-555555555555";
const PLANT_UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const CSV_CLEAN = [
  "timestamp,temperature,humidity",
  "2026-06-04T11:00:00Z,22.5,55",
  "2026-06-04T11:05:00Z,22.7,56",
].join("\n");

function parse(text: string): CsvPreviewParseResult {
  return parseDelimitedSensorPreview(text, { fileName: "fixture.csv", delimiter: "," });
}

function fillTent(uuid: string) {
  fireEvent.change(screen.getByTestId("csv-gate-tent-id"), { target: { value: uuid } });
}
function fillPlant(uuid: string) {
  fireEvent.change(screen.getByTestId("csv-gate-plant-id"), { target: { value: uuid } });
}

function assertNoWriteSideEffects() {
  expect(insertMock).not.toHaveBeenCalled();
  expect(upsertMock).not.toHaveBeenCalled();
  expect(updateMock).not.toHaveBeenCalled();
  expect(deleteMock).not.toHaveBeenCalled();
  expect(uploadMock).not.toHaveBeenCalled();
  expect(invokeMock).not.toHaveBeenCalled();
  // Even if .from() was called, none of "sensor_readings"/"action_queue"/"alerts"
  // should have been targeted in preview render.
  const tables = fromSpy.mock.calls.map((c) => c[0]);
  expect(tables).not.toContain("sensor_readings");
  expect(tables).not.toContain("action_queue");
  expect(tables).not.toContain("alerts");
}

beforeEach(() => {
  saveMock.mockReset();
  insertMock.mockReset();
  upsertMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
  uploadMock.mockReset();
  invokeMock.mockReset();
  fromSpy.mockClear();
});

// ---------------------------------------------------------------------------
// CSV preview no-write guard
// ---------------------------------------------------------------------------

describe("CSV normalization preview — no-write guard", () => {
  it("renders with writes disabled and the preview-only disclaimer", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows
        now={FIXED_NOW}
      />,
    );
    const section = screen.getByTestId("csv-normalization-preview-section");
    expect(section.getAttribute("data-writes-enabled")).toBe("false");
    expect(
      screen.getByTestId("sensor-normalization-preview-panel").getAttribute("data-writes-enabled"),
    ).toBe("false");
    expect(
      screen.getByTestId("csv-normalization-preview-section-disclaimer"),
    ).toHaveTextContent(/Preview only — no sensor readings will be saved\./);
  });

  it("uses canonical CSV source/identity/transport badges", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows
        now={FIXED_NOW}
      />,
    );
    const badges = screen
      .getAllByTestId("sensor-normalization-preview-badge")
      .map((n) => n.textContent ?? "");
    expect(badges.some((b) => b.includes("Source: csv"))).toBe(true);
    expect(badges.some((b) => b.includes("Identity: csv_import"))).toBe(true);
    expect(badges.some((b) => b.includes("Transport: csv"))).toBe(true);
  });

  it("makes no Supabase write/edge calls and no action_queue/alerts writes after interaction", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows
        now={FIXED_NOW}
      />,
    );
    fillTent(TENT_UUID);
    fillPlant(PLANT_UUID);
    // Tent linked → long-form preview rows visible, but still read-only.
    expect(
      Number(screen.getByTestId("sensor-normalization-preview-row-count").textContent),
    ).toBeGreaterThan(0);
    assertNoWriteSideEffects();
  });

  it("keeps the disabled import/convert CTA disabled (writes off)", () => {
    render(
      <CsvPreviewReviewGate
        previewResult={parse(CSV_CLEAN)}
        hasHardBlockedRows={false}
        hasAcceptedRows
        now={FIXED_NOW}
      />,
    );
    const btn = screen.getByTestId("csv-gate-save-button");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("data-writes-enabled")).toBe("false");
    assertNoWriteSideEffects();
  });
});

// ---------------------------------------------------------------------------
// Quick Log Environment Check preview no-write guard
// ---------------------------------------------------------------------------

describe("Quick Log Environment Check preview — no-write guard", () => {
  it("renders compact preview with writes disabled and manual labels", () => {
    const h = renderQuickLogEnvironmentCheck();
    h.setMeasurement("room-temp-f", "76");
    h.setMeasurement("humidity", "55");

    expect(h.getPreviewPanel()).not.toBeNull();
    expect(h.getPreviewWritesEnabled()).toBe("false");

    const labels = h.getPreviewBadgeLabels();
    expect(labels.some((l) => l.includes("Source: manual"))).toBe(true);
    expect(labels.some((l) => l.includes("Identity: manual_entry"))).toBe(true);
    expect(labels.some((l) => l.includes("Transport: manual"))).toBe(true);

    const slot = h.getPreviewSlot()!;
    expect(
      within(slot).getByTestId("sensor-normalization-preview-disclaimer").textContent,
    ).toMatch(/Preview only/i);
  });

  it("preview render alone does not call save or any Supabase write helpers", () => {
    const h = renderQuickLogEnvironmentCheck();
    h.setMeasurement("room-temp-f", "76");
    h.setMeasurement("humidity", "55");
    h.setMeasurement("ec", "1.6");
    expect(saveMock).not.toHaveBeenCalled();
    assertNoWriteSideEffects();
  });

  it("does not render the preview for note-only entries", () => {
    const h = renderQuickLogEnvironmentCheck();
    expect(h.getPreviewSlot()).toBeNull();
    expect(saveMock).not.toHaveBeenCalled();
    assertNoWriteSideEffects();
  });
});

// ---------------------------------------------------------------------------
// Static safety scan over preview-related files
// ---------------------------------------------------------------------------

const PREVIEW_FILES = [
  "src/components/CsvPreviewReviewGate.tsx",
  "src/components/SensorNormalizationPreviewPanel.tsx",
  "src/lib/sensors/sensorNormalizationPreviewViewModel.ts",
  "src/test/helpers/quickLogEnvironmentCheckTestHelper.tsx",
];

// QuickLog.tsx legitimately performs save writes outside of preview, so it
// is scanned narrowly for normalized long-form persistence patterns only.
const QUICK_LOG_FORBIDDEN: RegExp[] = [
  /normalizedReadingToLongFormRows\s*\(/,
  /insertSensorReading/,
  /useInsertSensorReading\(/,
  /supabase\.from\(\s*["']sensor_readings["']\s*\)/,
];

const PREVIEW_FORBIDDEN: RegExp[] = [
  /insertSensorReading/,
  /useInsertSensorReading\(/,
  /\.insert\(/,
  /\.upsert\(/,
  /\.update\(/,
  /\.delete\(/,
  /\.upload\(/,
  /supabase\.from\(\s*["']sensor_readings["']\s*\)/,
  /functions\.invoke/,
  /from\(\s*["']action_queue["']\s*\)/,
  /from\(\s*["']alerts["']\s*\)/,
  /service_role/i,
  /bridge[_-]?token/i,
];

describe("Sensor normalization preview — static safety scan", () => {
  for (const rel of PREVIEW_FILES) {
    it(`${rel} contains no forbidden write/IO patterns`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      for (const p of PREVIEW_FORBIDDEN) {
        expect(p.test(src), `unexpected match in ${rel}: ${p}`).toBe(false);
      }
    });
  }

  it("src/components/QuickLog.tsx contains no normalized long-form persistence", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/QuickLog.tsx"),
      "utf8",
    );
    for (const p of QUICK_LOG_FORBIDDEN) {
      expect(p.test(src), `unexpected match in QuickLog.tsx: ${p}`).toBe(false);
    }
  });
});

/**
 * Structured readings readback (grower bug item 14, review of #2863 at f5399254).
 *
 * Three readback defects reproduced against that head:
 *
 * 1. A Quick Log saved with air readings AND a structured reading (soil temp,
 *    VWC, soil EC, CO₂, PPFD) writes `details.manual_sensor_snapshot` carrying
 *    only the structured keys; the air readings live on the RPC's environment
 *    event sibling as before. Timeline readback saw a `manual_sensor_snapshot`
 *    and skipped attaching the sibling, so the saved air readings vanished from
 *    the card. The air rows were never deleted. The fix is in readback so rows
 *    already saved this way come back too.
 * 2. `soil_temp_c`, `soil_ec_ms_cm` and `ppfd` were read only by the Recent
 *    panel (`structuredReadingChips`, ten rows). Ordinary Timeline cards and the
 *    PDF reading line share `buildTimelineSensorSnapshotViewModel`, which never
 *    picked those keys.
 * 3. The correction dialog offered no field for the structured keys and did
 *    not say so (spec docs/specs/quick-log-structured-sensor-readings.md §3.5,
 *    §4.5).
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TimelineQuickLogEnvironmentSnapshotReadback } from "@/lib/timelineQuickLogEnvironmentSnapshotReadback";
import { buildTimelineSensorSnapshotViewModel } from "@/lib/timelineSensorSnapshotViewModel";
import {
  QUICKLOG_CORRECTION_STRUCTURED_READINGS_NOTE,
  quickLogCorrectionStructuredReadingsNote,
} from "@/lib/quickLogStructuredReadingRules";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-a" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: async () => ({ data: [{ id: "plant-a", name: "Plant A" }], error: null }),
      };
      return query;
    },
  },
}));

import QuickLogEntryIntegrityControls from "@/components/QuickLogEntryIntegrityControls";

const ROOT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TS = "2026-11-04T15:00:00.000Z";

/** What `buildQuickLogV2SavePayload` writes when soil + air were both typed. */
const SOIL_ONLY_MANUAL_SNAPSHOT = {
  source: "manual",
  captured_at: TS,
  soil_temp_c: 20,
  soil_moisture_pct: 40,
  soil_ec_ms_cm: 1.2,
  ppfd: 800,
};

/** The RPC's rows: the observation root the diary links to, and its same-instant environment sibling. */
const SIBLINGS = [
  {
    id: ROOT_ID,
    event_type: "observation",
    source: "manual",
    plant_id: null,
    occurred_at: TS,
    created_at: TS,
  },
  {
    id: "env-sibling",
    event_type: "environment",
    source: "manual",
    plant_id: null,
    occurred_at: TS,
    created_at: TS,
    environment_events: { temperature_c: 25, humidity_pct: 55, vpd_kpa: 1.4 },
  },
];

describe("defect 1 — air readings survive a structured snapshot", () => {
  it("attaches the sibling's air readings when manual_sensor_snapshot has none", () => {
    const [row] = TimelineQuickLogEnvironmentSnapshotReadback.attach(
      [
        {
          id: "entry-1",
          entry_at: TS,
          details: {
            linked_grow_event_id: ROOT_ID,
            manual_sensor_snapshot: { ...SOIL_ONLY_MANUAL_SNAPSHOT },
          },
        },
      ],
      SIBLINGS as never,
    );
    const manual = row.details?.manual_sensor_snapshot as Record<string, unknown>;
    // Air came back from the sibling.
    expect(manual.temp_f).toBe(77);
    expect(manual.humidity_percent).toBe(55);
    // Structured keys were kept, not overwritten.
    expect(manual.soil_temp_c).toBe(20);
    expect(manual.soil_moisture_pct).toBe(40);
    expect(manual.soil_ec_ms_cm).toBe(1.2);
    expect(manual.ppfd).toBe(800);
    expect(manual.source).toBe("manual");
    const sensor = (row.details as Record<string, unknown>).sensor_snapshot as Record<
      string,
      unknown
    >;
    expect(sensor.temp_c).toBe(25);
    expect(sensor.rh).toBe(55);
    expect(sensor.vpd).toBe(1.4);
  });

  it("leaves a manual_sensor_snapshot that already carries air readings alone", () => {
    const details = {
      linked_grow_event_id: ROOT_ID,
      manual_sensor_snapshot: { source: "manual", temp_f: 70, humidity_percent: 50 },
    };
    const [row] = TimelineQuickLogEnvironmentSnapshotReadback.attach(
      [{ id: "entry-2", entry_at: TS, details }],
      SIBLINGS as never,
    );
    expect(row.details).toBe(details);
  });

  it("leaves a structured-only snapshot alone when there is no linked sibling", () => {
    const details = { manual_sensor_snapshot: { ...SOIL_ONLY_MANUAL_SNAPSHOT } };
    const [row] = TimelineQuickLogEnvironmentSnapshotReadback.attach(
      [{ id: "entry-3", entry_at: TS, details }],
      [],
    );
    expect(row.details).toBe(details);
  });

  it("the card then shows air and soil together", () => {
    const [row] = TimelineQuickLogEnvironmentSnapshotReadback.attach(
      [
        {
          id: "entry-4",
          entry_at: TS,
          details: {
            linked_grow_event_id: ROOT_ID,
            manual_sensor_snapshot: { ...SOIL_ONLY_MANUAL_SNAPSHOT },
          },
        },
      ],
      SIBLINGS as never,
    );
    const line = TimelineQuickLogEnvironmentSnapshotReadback.pdfReadingLine(row.details);
    expect(line).toContain("Temp 77°F");
    expect(line).toContain("RH 55%");
    expect(line).toContain("Soil 40%");
  });
});

describe("defect 2 — soil temp, soil EC and PPFD on Timeline cards and the PDF line", () => {
  const snapshot = {
    ...SOIL_ONLY_MANUAL_SNAPSHOT,
    temp_f: 77,
    humidity_percent: 55,
  };

  it("shows the three chips, soil temp in the viewer's unit", () => {
    const vmF = buildTimelineSensorSnapshotViewModel(snapshot, {
      validateManualCompatibility: true,
      preferUnit: "F",
    });
    expect(vmF.kind).toBe("chips");
    if (vmF.kind !== "chips") return;
    const byMetric = Object.fromEntries(vmF.chips.map((chip) => [chip.metric, chip]));
    expect(byMetric.soil_temp?.display).toBe("68°F");
    expect(byMetric.soil_ec?.display).toBe("1.2 mS/cm");
    expect(byMetric.ppfd?.display).toBe("800 µmol/m²/s");
    // Air and soil moisture are still there.
    expect(byMetric.temp_f?.display).toBe("77°F");
    expect(byMetric.rh?.display).toBe("55%");
    expect(byMetric.soil_moisture?.display).toBe("40%");

    const vmC = buildTimelineSensorSnapshotViewModel(snapshot, {
      validateManualCompatibility: true,
      preferUnit: "C",
    });
    if (vmC.kind !== "chips") throw new Error("expected chips");
    expect(vmC.chips.find((chip) => chip.metric === "soil_temp")?.display).toBe("20°C");
  });

  it("never shows an implausible structured value as a healthy chip", () => {
    const vm = buildTimelineSensorSnapshotViewModel(
      { source: "manual", temp_f: 77, soil_temp_c: 95, soil_ec_ms_cm: 80, ppfd: 99999 },
      { validateManualCompatibility: true, preferUnit: "F" },
    );
    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    const metrics = vm.chips.map((chip) => chip.metric);
    expect(metrics).not.toContain("soil_temp");
    expect(metrics).not.toContain("soil_ec");
    expect(metrics).not.toContain("ppfd");
    expect(vm.errors.join(" ")).toMatch(/soil temperature/i);
    expect(vm.errors.join(" ")).toMatch(/soil ec/i);
    expect(vm.errors.join(" ")).toMatch(/ppfd/i);
  });

  it("the PDF reading line carries the three readings", () => {
    const line = TimelineQuickLogEnvironmentSnapshotReadback.pdfReadingLine({
      manual_sensor_snapshot: snapshot,
    });
    expect(line).toContain("Soil temp 68°F");
    expect(line).toContain("Soil EC 1.2 mS/cm");
    expect(line).toContain("PPFD 800 µmol/m²/s");
  });

  it("old rows without the keys render exactly as before", () => {
    const vm = buildTimelineSensorSnapshotViewModel(
      { source: "manual", temp_f: 77, humidity_percent: 55 },
      { validateManualCompatibility: true, preferUnit: "F" },
    );
    if (vm.kind !== "chips") throw new Error("expected chips");
    expect(vm.chips.map((chip) => chip.metric)).toEqual(["temp_f", "rh"]);
    expect(vm.errors).toEqual([]);
  });
});

describe("defect 3 — the correction dialog says structured readings can't be edited yet", () => {
  function mount(props: Partial<Parameters<typeof QuickLogEntryIntegrityControls>[0]> = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <QuickLogEntryIntegrityControls
          handle={{ growEventId: ROOT_ID }}
          currentNote="Original"
          currentPlantId="plant-a"
          onChanged={vi.fn()}
          {...props}
        />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      cleanup();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  });

  it("pure helper: a note only when a structured key is present", () => {
    expect(
      quickLogCorrectionStructuredReadingsNote({
        manual_sensor_snapshot: { source: "manual", soil_temp_c: 20 },
      }),
    ).toBe(QUICKLOG_CORRECTION_STRUCTURED_READINGS_NOTE);
    expect(
      quickLogCorrectionStructuredReadingsNote({
        manual_sensor_snapshot: { source: "manual", temp_f: 77, humidity_percent: 55 },
      }),
    ).toBeNull();
    expect(quickLogCorrectionStructuredReadingsNote({ manual_sensor_snapshot: {} })).toBeNull();
    expect(quickLogCorrectionStructuredReadingsNote({})).toBeNull();
    expect(quickLogCorrectionStructuredReadingsNote(null)).toBeNull();
    expect(quickLogCorrectionStructuredReadingsNote("x")).toBeNull();
    expect(quickLogCorrectionStructuredReadingsNote([])).toBeNull();
  });

  it("renders the note and offers no structured field", () => {
    mount({
      environmentCheckDetails: { manual_sensor_snapshot: { ...SOIL_ONLY_MANUAL_SNAPSHOT } },
      correctionValues: { kind: "sensor", sensor: { temperature_c: 25, humidity_pct: 55 } },
    });
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    expect(screen.getByTestId("quicklog-correct-structured-readings-note")).toHaveTextContent(
      QUICKLOG_CORRECTION_STRUCTURED_READINGS_NOTE,
    );
    expect(screen.queryByLabelText(/soil temp/i)).toBeNull();
    expect(screen.queryByLabelText(/ppfd/i)).toBeNull();
  });

  it("renders no note for an entry without structured readings", () => {
    mount({
      environmentCheckDetails: { manual_sensor_snapshot: { source: "manual", temp_f: 77 } },
      correctionValues: { kind: "sensor", sensor: { temperature_c: 25 } },
    });
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    expect(screen.queryByTestId("quicklog-correct-structured-readings-note")).toBeNull();
  });
});

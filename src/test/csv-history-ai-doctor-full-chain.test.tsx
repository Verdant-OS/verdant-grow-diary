/**
 * CSV history acquisition -> AI Doctor full-chain regression.
 *
 * This is intentionally a routed, mocked-browser integration rather than a
 * composition of pure helpers. It drives the real import launcher/modal,
 * persistence adapter, dedicated tent-scoped history hook, Tent history
 * presenter, explicit plant-choice links, Plant AI Doctor review component,
 * request transport parser, and shared server prompt assembly.
 *
 * Safety: the database boundary is in-memory; no network/model calls, alerts,
 * Action Queue writes, automation, or device control are available.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface StoredSensorReading {
  id: string;
  user_id: string;
  tent_id: string;
  source: string;
  metric: string;
  value: number;
  quality: string;
  ts: string;
  captured_at: string;
  created_at: string;
  raw_payload: Record<string, unknown>;
}

const database = vi.hoisted(() => ({
  rows: [] as StoredSensorReading[],
  tables: [] as string[],
  insertedBatches: [] as StoredSensorReading[][],
  duplicateReads: 0,
  importedHistoryReads: 0,
  sourceFilters: [] as unknown[][],
  nextId: 1,
}));

const supabaseFunctionsInvoke = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => {
  type OrderSpec = {
    column: keyof StoredSensorReading;
    ascending: boolean;
    nullsFirst: boolean;
  };

  function createBuilder() {
    const equalFilters = new Map<string, unknown>();
    const inFilters = new Map<string, Set<unknown>>();
    const orders: OrderSpec[] = [];
    let minimumCapturedAt: string | null = null;
    let maximumCapturedAt: string | null = null;

    const filteredRows = () =>
      database.rows.filter((row) => {
        for (const [column, expected] of equalFilters) {
          if ((row as unknown as Record<string, unknown>)[column] !== expected) return false;
        }
        for (const [column, allowed] of inFilters) {
          if (!allowed.has((row as unknown as Record<string, unknown>)[column])) return false;
        }
        if (minimumCapturedAt && row.captured_at < minimumCapturedAt) return false;
        if (maximumCapturedAt && row.captured_at > maximumCapturedAt) return false;
        return true;
      });

    const sortedRows = () =>
      [...filteredRows()].sort((a, b) => {
        for (const order of orders) {
          const av = a[order.column];
          const bv = b[order.column];
          if (av === bv) continue;
          if (av == null || bv == null) {
            const nullOrder = av == null ? -1 : 1;
            return order.nullsFirst ? nullOrder : -nullOrder;
          }
          const comparison = String(av).localeCompare(String(bv));
          if (comparison !== 0) return order.ascending ? comparison : -comparison;
        }
        return 0;
      });

    const builder: Record<string, unknown> = {};
    builder.select = (_columns: string) => builder;
    builder.insert = async (input: ReadonlyArray<Record<string, unknown>>) => {
      const stored = input.map((row) => {
        const capturedAt = String(row.captured_at);
        return {
          ...row,
          id: `db-reading-${database.nextId++}`,
          quality: "ok",
          ts: capturedAt,
          captured_at: capturedAt,
          created_at: `2026-07-19T00:00:${String(database.nextId).padStart(2, "0")}.000Z`,
        } as StoredSensorReading;
      });
      database.rows.push(...stored);
      database.insertedBatches.push(stored);
      return { error: null };
    };
    builder.eq = (column: string, value: unknown) => {
      equalFilters.set(column, value);
      return builder;
    };
    builder.in = (column: string, values: unknown[]) => {
      inFilters.set(column, new Set(values));
      if (column === "source") database.sourceFilters.push([...values]);
      return builder;
    };
    builder.gte = (column: string, value: string) => {
      if (column === "captured_at") minimumCapturedAt = value;
      return builder;
    };
    builder.lte = (column: string, value: string) => {
      if (column === "captured_at") maximumCapturedAt = value;
      database.duplicateReads += 1;
      return Promise.resolve({ data: filteredRows(), error: null });
    };
    builder.order = (
      column: keyof StoredSensorReading,
      options: { ascending?: boolean; nullsFirst?: boolean } = {},
    ) => {
      orders.push({
        column,
        ascending: options.ascending === true,
        nullsFirst: options.nullsFirst === true,
      });
      return builder;
    };
    builder.limit = (limit: number) => {
      database.importedHistoryReads += 1;
      return Promise.resolve({ data: sortedRows().slice(0, limit), error: null });
    };
    return builder;
  }

  return {
    supabase: {
      from(table: string) {
        database.tables.push(table);
        if (table !== "sensor_readings") {
          throw new Error(`Unexpected table access in CSV full-chain test: ${table}`);
        }
        return createBuilder();
      },
      functions: { invoke: supabaseFunctionsInvoke },
    },
  };
});

const trackFunnelEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent }));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-csv-chain" }, loading: false }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: () => ({ items: [], isLoading: false }),
  TIMELINE_MEMORY_DEFAULT_LIMIT: 100,
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (tentIds: string[]) => ({
    byTent: Object.fromEntries(tentIds.map((tentId) => [tentId, []])),
    statusByTent: Object.fromEntries(tentIds.map((tentId) => [tentId, "success"])),
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({ loading: false, entitlement: null, refetch: vi.fn() }),
}));

import { EnvironmentCsvImportLauncher } from "@/components/EnvironmentCsvImportLauncher";
import ImportedSensorHistoryPanel from "@/components/ImportedSensorHistoryPanel";
import PlantDetailAiDoctorLiveReview from "@/components/PlantDetailAiDoctorLiveReview";
import { useImportedSensorHistory } from "@/hooks/useImportedSensorHistory";
import { AI_DOCTOR_CSV_HISTORY_SOURCES } from "@/lib/aiDoctorCsvHistoryContextRules";
import { buildAiDoctorPromptMessages } from "@/lib/aiDoctorPromptAssembly";
import type { AiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacket";
import { validateAndNormalizeAiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacketValidationRules";
import type { AiDoctorReviewRequestEnvelope } from "@/lib/aiDoctorReviewRequestTransportRules";
import { parseAiDoctorReviewRequestEnvelope } from "@/lib/aiDoctorReviewRequestTransportRules";
import { resolveImportedHistoryHandoffReadStatus } from "@/lib/importedSensorHistoryAiDoctorHandoffRules";
import {
  IMPORTED_SENSOR_HISTORY_ANCHOR_ID,
  resolveImportedSensorHistoryReadStatus,
} from "@/lib/importedSensorHistoryViewModel";

const GROW_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e02";
const TENT_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e01";
const NORTH_STAR_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e03";
const ZULU_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e04";
const PRIVATE_MARKER = "bridge_token_do_not_prompt_7f3b";
const CROSS_TENT_MARKER = "cross_tent_reading_do_not_include_8a4c";
const SAME_TENT_NON_CSV_MARKER = "same_tent_live_reading_do_not_include_9b5d";

const plants = [
  {
    id: ZULU_ID,
    name: "Zulu",
    strain: "Test cultivar Z",
    stage: "flower",
    medium: "coco",
    photo: null,
    isArchived: false,
  },
  {
    id: NORTH_STAR_ID,
    name: "North Star",
    strain: "Test cultivar N",
    stage: "flower",
    medium: "coco",
    photo: null,
    isArchived: false,
  },
] as const;

type Invoke = (
  name: string,
  init: { body: AiDoctorReviewRequestEnvelope<AiDoctorReviewRequestPacket> },
) => Promise<{ data: unknown; error: unknown }>;

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="csv-chain-location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

function TentHistoryRoute() {
  const { tentId } = useParams<{ tentId: string }>();
  const importedHistory = useImportedSensorHistory(tentId);
  const readings = importedHistory.data ?? [];
  return (
    <ImportedSensorHistoryPanel
      tentId={tentId}
      readings={readings}
      plants={plants}
      plantReadStatus={resolveImportedHistoryHandoffReadStatus({
        isError: false,
        isFetching: false,
        hasRows: plants.length > 0,
      })}
      readStatus={resolveImportedSensorHistoryReadStatus({
        isError: importedHistory.isError,
        isFetching: importedHistory.isFetching,
        hasRows: readings.length > 0,
      })}
      onRetry={() => {
        void importedHistory.refetch();
      }}
    />
  );
}

function PlantReviewRoute({ invoke }: { invoke: Invoke }) {
  const { plantId } = useParams<{ plantId: string }>();
  const [searchParams] = useSearchParams();
  const selectedPlant = plants.find((plant) => plant.id === plantId) ?? null;
  return (
    <PlantDetailAiDoctorLiveReview
      plantId={plantId ?? ""}
      plant={selectedPlant}
      growId={GROW_ID}
      tentId={searchParams.get("tentId")}
      invoke={invoke}
    />
  );
}

function renderFullChain(queryClient: QueryClient, invoke: Invoke, initialEntry = "/import") {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <Routes>
          <Route
            path="/import"
            element={<EnvironmentCsvImportLauncher growId={GROW_ID} tentId={TENT_ID} />}
          />
          <Route path="/tents/:tentId" element={<TentHistoryRoute />} />
          <Route path="/plants/:plantId" element={<PlantReviewRoute invoke={invoke} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function uploadAndConfirmCsv() {
  fireEvent.click(screen.getByTestId("csv-launcher-button"));
  const csv = [
    "Timestamp,Temp(°C),RH,PrivateNote",
    `2026-06-01T10:00:00Z,24,54,${PRIVATE_MARKER}`,
    `2026-06-02T10:00:00Z,26,58,${PRIVATE_MARKER}`,
  ].join("\n");
  const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
  Object.defineProperty(input, "files", {
    value: [new File([csv], "tent-history.csv", { type: "text/csv" })],
  });
  fireEvent.change(input);
  await screen.findByTestId("csv-import-preview");
  fireEvent.click(screen.getByTestId("csv-import-confirm"));
  await screen.findByTestId("csv-import-done");
}

beforeEach(() => {
  database.rows = [];
  database.tables = [];
  database.insertedBatches = [];
  database.duplicateReads = 0;
  database.importedHistoryReads = 0;
  database.sourceFilters = [];
  database.nextId = 1;
  supabaseFunctionsInvoke.mockReset();
  trackFunnelEvent.mockReset();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => cleanup());

describe("CSV history -> AI Doctor full-chain regression", () => {
  it("persists, reloads, visualizes, requires plant choice, prompts safely, and freezes retries", async () => {
    const prompts: string[] = [];
    const validatedPackets: AiDoctorReviewRequestPacket[] = [];
    const invoke = vi.fn<Invoke>(async (name, init) => {
      expect(name).toBe("ai-doctor-review");
      const parsed = parseAiDoctorReviewRequestEnvelope(init.body);
      if (!parsed) throw new Error("AI Doctor request envelope did not parse");
      const validated = validateAndNormalizeAiDoctorReviewRequestPacket(parsed.packet);
      if (!validated) throw new Error("AI Doctor request packet did not validate");
      validatedPackets.push(validated);
      const assembled = buildAiDoctorPromptMessages(validated);
      prompts.push(`${assembled.system}\n${assembled.user}`);
      // Stop after the real request/prompt boundary. No model or persistence.
      return { data: null, error: { message: "intentional full-chain test stop" } };
    });
    const importQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    renderFullChain(importQueryClient, invoke);
    await uploadAndConfirmCsv();

    expect(database.insertedBatches).toHaveLength(1);
    expect(database.rows.length).toBeGreaterThanOrEqual(4);
    expect(database.duplicateReads).toBe(1);
    expect(database.rows.every((row) => row.source === "csv")).toBe(true);
    expect(database.rows.every((row) => row.tent_id === TENT_ID)).toBe(true);
    expect(database.rows.every((row) => row.user_id === "user-csv-chain")).toBe(true);
    expect(JSON.stringify(database.rows)).toContain(PRIVATE_MARKER);
    expect(
      database.rows
        .map((row) => ({
          capturedAt: row.captured_at,
          metric: row.metric,
          value: row.value,
        }))
        .sort((a, b) => `${a.capturedAt}:${a.metric}`.localeCompare(`${b.capturedAt}:${b.metric}`)),
    ).toEqual([
      {
        capturedAt: "2026-06-01T10:00:00.000Z",
        metric: "humidity_pct",
        value: 54,
      },
      {
        capturedAt: "2026-06-01T10:00:00.000Z",
        metric: "temperature_c",
        value: 24,
      },
      {
        capturedAt: "2026-06-01T10:00:00.000Z",
        metric: "vpd_kpa",
        value: 1.373,
      },
      {
        capturedAt: "2026-06-02T10:00:00.000Z",
        metric: "humidity_pct",
        value: 58,
      },
      {
        capturedAt: "2026-06-02T10:00:00.000Z",
        metric: "temperature_c",
        value: 26,
      },
      {
        capturedAt: "2026-06-02T10:00:00.000Z",
        metric: "vpd_kpa",
        value: 1.412,
      },
    ]);
    expect(invoke).not.toHaveBeenCalled();
    expect(supabaseFunctionsInvoke).not.toHaveBeenCalled();
    const persistedTentReadingCount = database.rows.length;
    database.rows.push({
      ...database.rows[0],
      id: "db-reading-cross-tent",
      tent_id: "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e99",
      value: 99,
      raw_payload: { marker: CROSS_TENT_MARKER },
    });
    database.rows.push({
      ...database.rows[0],
      id: "db-reading-same-tent-live",
      source: "live",
      value: 88,
      raw_payload: { marker: SAME_TENT_NON_CSV_MARKER },
    });

    const historyHref = screen.getByTestId("csv-import-view-history").getAttribute("href");
    expect(historyHref).toBe(`/tents/${TENT_ID}#${IMPORTED_SENSOR_HISTORY_ANCHOR_ID}`);
    fireEvent.click(screen.getByTestId("csv-import-view-history"));
    await waitFor(() =>
      expect(screen.getByTestId("csv-chain-location")).toHaveTextContent(
        `/tents/${TENT_ID}#${IMPORTED_SENSOR_HISTORY_ANCHOR_ID}`,
      ),
    );

    cleanup();
    importQueryClient.clear();
    const readsBeforeReload = database.importedHistoryReads;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    renderFullChain(queryClient, invoke, historyHref ?? "/missing-history-href");
    await screen.findByTestId("imported-history-summary");

    expect(screen.getByTestId("csv-chain-location")).toHaveTextContent(
      `/tents/${TENT_ID}#${IMPORTED_SENSOR_HISTORY_ANCHOR_ID}`,
    );
    expect(database.importedHistoryReads).toBeGreaterThan(readsBeforeReload);
    expect(database.sourceFilters).toContainEqual([...AI_DOCTOR_CSV_HISTORY_SOURCES]);
    expect(screen.getByTestId("imported-history-source-badge")).toHaveTextContent("Source: CSV");
    expect(screen.getByTestId("imported-history-not-live-badge")).toHaveTextContent(
      "Not live data",
    );
    expect(screen.getByTestId("imported-history-total")).toHaveTextContent(
      String(persistedTentReadingCount),
    );
    expect(screen.getByTestId("imported-sensor-history-panel")).not.toHaveTextContent(
      PRIVATE_MARKER,
    );
    expect(screen.getByTestId("imported-sensor-history-panel")).not.toHaveTextContent(
      CROSS_TENT_MARKER,
    );
    expect(screen.getByTestId("imported-sensor-history-panel")).not.toHaveTextContent(
      SAME_TENT_NON_CSV_MARKER,
    );
    const visibleRows = within(screen.getByTestId("imported-history-recent-rows"))
      .getAllByRole("row")
      .slice(1)
      .map((row) => {
        const cells = within(row).getAllByRole("cell");
        return [cells[1].textContent, cells[2].textContent];
      });
    expect(visibleRows).toEqual([
      ["humidity_pct", "58"],
      ["temperature_c", "26"],
      ["vpd_kpa", "1.412"],
      ["humidity_pct", "54"],
      ["temperature_c", "24"],
      ["vpd_kpa", "1.373"],
    ]);

    const handoff = screen.getByTestId("imported-history-ai-doctor-handoff");
    expect(handoff).toHaveAttribute("data-state", "multiple_active_plants");
    expect(handoff).toHaveTextContent("no plant is selected by default");
    const choices = within(screen.getByTestId("imported-history-ai-doctor-choices")).getAllByRole(
      "link",
    );
    expect(choices.map((choice) => choice.textContent)).toEqual([
      "Review North Star",
      "Review Zulu",
    ]);
    expect(invoke).not.toHaveBeenCalled();

    fireEvent.click(choices[0]);
    expect(await screen.findByTestId("csv-chain-location")).toHaveTextContent(
      `/plants/${NORTH_STAR_ID}?tentId=${TENT_ID}`,
    );
    const start = await screen.findByTestId("plant-ai-doctor-live-review-start");
    await waitFor(() => expect(start).not.toBeDisabled());
    expect(screen.getByTestId("plant-ai-doctor-live-review")).toHaveAttribute(
      "data-review-mode",
      "historical_review",
    );
    expect(invoke).not.toHaveBeenCalled();

    const acceptedReadingCount = persistedTentReadingCount;
    fireEvent.click(start);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    await screen.findByTestId("plant-ai-doctor-live-review-retry");

    const firstEnvelope = invoke.mock.calls[0][1].body;
    const firstPacket = firstEnvelope.packet;
    expect(firstEnvelope.grow_id).toBe(GROW_ID);
    expect(firstPacket.plant.strain).toBe("Test cultivar N");
    expect(firstPacket.imported_sensor_history?.totalReadings).toBe(acceptedReadingCount);
    expect(firstPacket.imported_sensor_history?.dateRange).toEqual({
      earliest: "2026-06-01T10:00:00.000Z",
      latest: "2026-06-02T10:00:00.000Z",
    });
    expect(
      firstPacket.imported_sensor_history?.metrics.find(
        (metric) => metric.metric === "temperature_c",
      ),
    ).toMatchObject({ count: 2, min: 24, max: 26, avg: 25 });
    expect(
      firstPacket.imported_sensor_history?.metrics.find(
        (metric) => metric.metric === "humidity_pct",
      ),
    ).toMatchObject({ count: 2, min: 54, max: 58, avg: 56 });
    expect(
      firstPacket.imported_sensor_history?.metrics.find((metric) => metric.metric === "vpd_kpa"),
    ).toMatchObject({ count: 2, min: 1.373, max: 1.412, avg: 1.393 });
    expect(firstPacket.missingLiveSensorReadings).toBe(true);
    expect(validatedPackets[0]).toEqual(firstPacket);
    expect(JSON.stringify(firstPacket)).not.toContain("raw_payload");
    expect(JSON.stringify(firstPacket)).not.toContain(PRIVATE_MARKER);
    expect(JSON.stringify(firstPacket)).not.toContain(CROSS_TENT_MARKER);
    expect(JSON.stringify(firstPacket)).not.toContain(SAME_TENT_NON_CSV_MARKER);
    expect(prompts[0]).toContain("[Historical sensor context]");
    expect(prompts[0]).toContain("This is historical CSV history, not current telemetry.");
    expect(prompts[0]).not.toContain(PRIVATE_MARKER);
    expect(prompts[0]).not.toContain(CROSS_TENT_MARKER);
    expect(prompts[0]).not.toContain(SAME_TENT_NON_CSV_MARKER);
    expect(prompts[0]).toContain('"avg":25');
    expect(prompts[0]).toContain('"avg":56');
    expect(prompts[0]).toContain('"avg":1.393');
    expect(prompts[0]).not.toContain(GROW_ID);
    expect(prompts[0]).not.toContain(TENT_ID);
    expect(prompts[0]).not.toContain(NORTH_STAR_ID);

    database.rows.push({
      ...database.rows[0],
      id: "db-reading-late",
      captured_at: "2026-06-03T10:00:00.000Z",
      ts: "2026-06-03T10:00:00.000Z",
      created_at: "2026-07-19T00:01:00.000Z",
      value: 31,
    });
    const readsBeforeRefresh = database.importedHistoryReads;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["sensor_readings"] });
    });
    await waitFor(() => expect(database.importedHistoryReads).toBeGreaterThan(readsBeforeRefresh));

    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-retry"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke.mock.calls[1][1].body).toEqual(firstEnvelope);
    expect(invoke.mock.calls.map(([name]) => name)).toEqual([
      "ai-doctor-review",
      "ai-doctor-review",
    ]);
    expect(validatedPackets[1]).toEqual(validatedPackets[0]);
    expect(prompts[1]).toBe(prompts[0]);

    expect(trackFunnelEvent).toHaveBeenCalledWith("csv_import_started");
    expect(trackFunnelEvent).toHaveBeenCalledWith(
      "csv_import_completed",
      expect.objectContaining({ rows: acceptedReadingCount }),
    );
    expect(trackFunnelEvent).toHaveBeenCalledWith("csv_history_ai_doctor_clicked", {
      surface: "imported_history",
    });
    expect(trackFunnelEvent).toHaveBeenCalledWith("ai_doctor_review_started", {
      surface: "historical_review",
    });
    expect(trackFunnelEvent).toHaveBeenCalledWith("historical_ai_review_started");
    const milestones = trackFunnelEvent.mock.calls.map(([event]) => event);
    const milestoneIndexes = [
      milestones.indexOf("csv_import_started"),
      milestones.indexOf("csv_import_completed"),
      milestones.indexOf("csv_history_ai_doctor_clicked"),
      milestones.indexOf("ai_doctor_review_started"),
      milestones.indexOf("historical_ai_review_started"),
    ];
    expect(milestoneIndexes.every((index) => index >= 0)).toBe(true);
    expect(milestoneIndexes).toEqual([...milestoneIndexes].sort((a, b) => a - b));
    expect(database.tables.every((table) => table === "sensor_readings")).toBe(true);
    expect(supabaseFunctionsInvoke).not.toHaveBeenCalled();
  });
});

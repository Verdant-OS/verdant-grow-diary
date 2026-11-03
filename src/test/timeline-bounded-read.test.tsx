import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TimelineCsvContextGate } from "@/components/TimelineCsvContextGate";
import { TimelineCsvContextPanel } from "@/components/TimelineCsvContextPanel";
import { buildAiDoctorCsvHistoryContext } from "@/lib/aiDoctorCsvHistoryContextRules";
import { buildSensorSourceHealth } from "@/lib/sensorSourceHealthRules";
import { buildTentSensorChartSeries, buildTentSensorHeaderView } from "@/lib/tentSensorChartRules";
import { TimelineBoundedRead } from "@/lib/timelineBoundedRead";

const queries = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const script = vi.hoisted(() => ({
  olderError: false,
  probeHits: 0,
}));

const TIED_AT = "2026-06-01T11:40:00.000Z";

vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query: Record<string, unknown> = { table, orders: [] as unknown[] };
      queries.push(query);
      const chain = {
        select: (columns: string) => {
          query.select = columns;
          return chain;
        },
        eq: (...args: unknown[]) => {
          query.eq = args;
          return chain;
        },
        in: (...args: unknown[]) => {
          query.in = args;
          return chain;
        },
        order: (...args: unknown[]) => {
          (query.orders as unknown[]).push(args);
          return chain;
        },
        or: (filter: string) => {
          query.or = filter;
          return chain;
        },
        limit: (limit: number) => {
          query.limit = limit;
          if (limit === 1) {
            script.probeHits += 1;
            const row =
              script.probeHits === 1
                ? [
                    {
                      id: "probe",
                      tent_id: "tA",
                      source: "csv",
                      metric: "humidity_pct",
                      value: 40,
                      captured_at: "2026-05-01T00:00:00.000Z",
                      grow_scope: "g1",
                      vpd_source: null,
                    },
                  ]
                : [];
            return Promise.resolve({ data: row, error: null });
          }
          if (query.or) {
            if (script.olderError) {
              script.olderError = false;
              return Promise.resolve({ data: null, error: { message: "older failed" } });
            }
            return Promise.resolve({
              data: [
                {
                  id: "tie-sibling",
                  tent_id: "tA",
                  source: "csv",
                  metric: "humidity_pct",
                  value: 61,
                  captured_at: TIED_AT,
                  grow_scope: "g1",
                  vpd_source: null,
                },
              ],
              error: null,
            });
          }
          const data = Array.from({ length: limit }, (_, index) => ({
            id: `row-${String(limit - index).padStart(5, "0")}`,
            tent_id: "tA",
            source: "csv",
            metric: "temperature_c",
            value: 20,
            captured_at: TIED_AT,
            grow_scope: "g1",
            vpd_source: null,
          }));
          return Promise.resolve({ data, error: null });
        },
      };
      return chain;
    },
  },
}));

const SENSOR_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_ID = "22222222-2222-4222-8222-222222222222";

function sensorExtract(confidence: string | null) {
  return {
    id: SENSOR_ID,
    user_id: USER_ID,
    tent_id: TENT_ID,
    metric: "temperature_c",
    value: 24,
    source: "live",
    quality: "ok",
    ts: "2026-06-01T00:00:00.000Z",
    captured_at: "2026-06-01T00:00:00.000Z",
    created_at: "2026-06-01T00:00:00.000Z",
    device_id: null,
    correction_valid: true,
    vendor: confidence ? "ecowitt_windows_testbench" : null,
    confidence,
    reported_verdant_source: null,
    gateway_stationtype: null,
    gateway_model: null,
    gateway_dateutc: null,
    gateway_freq: null,
    gateway_runtime: null,
    gateway_wh65batt: null,
    gateway_wh25batt: null,
  };
}

describe("TimelineBoundedRead", () => {
  afterEach(() => {
    cleanup();
    queries.length = 0;
    script.olderError = false;
    script.probeHits = 0;
  });

  it("keeps a source=live testbench row out of charts, VPD and source health", () => {
    const [testbench] = TimelineBoundedRead.acceptSensorList([sensorExtract("test")]);
    const [physical] = TimelineBoundedRead.acceptSensorList([sensorExtract(null)]);
    expect(buildTentSensorChartSeries([testbench])).toEqual([]);
    expect(buildTentSensorHeaderView([testbench]).hasReadings).toBe(false);
    expect(buildTentSensorHeaderView([testbench]).snapshot).toBeNull();
    expect(buildSensorSourceHealth([testbench])[0]?.status).toBe("diagnostic");
    expect(buildTentSensorChartSeries([physical]).length).toBeGreaterThan(0);
    expect(buildSensorSourceHealth([physical])[0]?.status).not.toBe("diagnostic");
  });

  it("keeps CSV vendor and suspicious flags for the AI Doctor summary", () => {
    const payload = TimelineBoundedRead.importedHistoryPayload({
      source_app: "spider_farmer",
      csv_import: "true",
      suspicious: "false",
      suspicious_flags: ["time_gap"],
    });
    const summary = buildAiDoctorCsvHistoryContext({
      rows: [
        {
          source: "csv",
          metric: "temperature_c",
          value: 22,
          quality: "ok",
          captured_at: "2026-06-01T00:00:00.000Z",
          raw_payload: payload,
        },
      ],
    });
    expect(summary.vendors.map((vendor) => vendor.vendorLabel)).toContain("Spider Farmer");
    expect(summary.suspiciousFlagCount).toBe(1);
  });

  it("opens CSV context only after the grower asks, and pages timestamp ties by id", async () => {
    render(
      <TimelineCsvContextGate
        growId="g1"
        entries={[{ id: "d1", tent_id: "tA", entry_at: "2026-06-01T12:00:00.000Z" }]}
      />,
    );
    expect(screen.queryByTestId("timeline-csv-context-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("timeline-csv-context-open"));
    const older = await screen.findByTestId("timeline-csv-load-older");
    const first = queries[0];
    expect(first?.limit).toBe(TimelineBoundedRead.csvPageSize);
    expect(first?.orders).toEqual([
      ["captured_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(first?.or).toBeUndefined();
    const cursorId = "row-00001";
    expect(queries[1]?.or).toBe(TimelineBoundedRead.csvOlderKeyset(TIED_AT, cursorId));
    fireEvent.click(older);
    await waitFor(() => expect(screen.getByText(/61/)).toBeTruthy());
    const olderQuery = queries.find(
      (query) => query.limit === TimelineBoundedRead.csvOlderFetchLimit,
    );
    expect(olderQuery?.or).toBe(TimelineBoundedRead.csvOlderKeyset(TIED_AT, cursorId));
    expect(String(olderQuery?.or)).toContain(`captured_at.eq.${TIED_AT}`);
    expect(String(olderQuery?.or)).toContain(`id.lt.${cursorId}`);
  });

  it("hides Load older when a full page has no older row", async () => {
    script.probeHits = 1;
    render(
      <TimelineCsvContextPanel
        growId="g1"
        entries={[{ id: "d1", tent_id: "tA", entry_at: "2026-06-01T12:00:00.000Z" }]}
      />,
    );
    await screen.findByTestId("timeline-csv-context-panel");
    await waitFor(() => expect(queries.some((query) => query.limit === 1)).toBe(true));
    expect(screen.queryByTestId("timeline-csv-load-older")).toBeNull();
  });

  it("retries a failed older page and keeps the rows already shown", async () => {
    render(
      <TimelineCsvContextPanel
        growId="g1"
        entries={[{ id: "d1", tent_id: "tA", entry_at: "2026-06-01T12:00:00.000Z" }]}
      />,
    );
    const older = await screen.findByTestId("timeline-csv-load-older");
    script.olderError = true;
    fireEvent.click(older);
    const retry = await screen.findByTestId("timeline-csv-load-older-retry");
    expect(screen.getByTestId("timeline-csv-context-panel")).toBeTruthy();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByText(/61/)).toBeTruthy());
    expect(screen.queryByTestId("timeline-csv-load-older-retry")).toBeNull();
  });
});

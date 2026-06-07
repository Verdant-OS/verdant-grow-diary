/**
 * EcowittLatestSnapshotCard — proof-card behavior tests.
 *
 * Validates the "Latest EcoWitt Reading" card requirements:
 *  - renders latest EcoWitt reading with correct metrics
 *  - shows empty state when no EcoWitt data exists
 *  - shows "Local Test Payload" badge when metadata.test_sender is true
 *  - displays stale/fresh status using existing logic
 *  - does not create action_queue records
 *  - does not call any ingest/write endpoint
 *
 * Read-only. No writes, no automation, no device control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { EcowittLatestSnapshotCard } from "@/components/EcowittLatestSnapshotCard";

const TENT_A = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-06-04T12:30:00Z");
const FRESH_AT = "2026-06-04T12:20:00Z";
const STALE_AT = "2026-06-04T08:00:00Z";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
let rowsMock: Array<Record<string, unknown>> = [];

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: rowsMock, error: null }),
    };
    return chain;
  };
  return { supabase: { from: () => makeChain() } };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" } }),
}));

beforeEach(() => {
  rowsMock = [];
});

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

function ecowittRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    tent_id: TENT_A,
    source: "ecowitt",
    captured_at: FRESH_AT,
    ts: FRESH_AT,
    raw_payload: {
      vendor: "ecowitt",
      temp1f: 77,
      humidity1: 55,
      dateutc: FRESH_AT,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1) Card renders the latest EcoWitt reading.
// ---------------------------------------------------------------------------
describe("EcowittLatestSnapshotCard — proof card behavior", () => {
  it("renders the latest EcoWitt reading with temp_f, humidity, VPD, CO2, soil moisture", async () => {
    rowsMock = [
      ecowittRow({
        raw_payload: {
          vendor: "ecowitt",
          temp1f: 78.6,
          humidity1: 56,
          soilmoisture1: 45,
          co2: 966,
          dateutc: FRESH_AT,
        },
      }),
    ];
    render(<EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />, {
      wrapper: wrap(),
    });
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-metric-temp_f")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("ecowitt-metric-temp_f").textContent).toBe(
      "78.6 °F",
    );
    expect(screen.getByTestId("ecowitt-metric-humidity_pct").textContent).toBe(
      "56 %",
    );
    expect(screen.getByTestId("ecowitt-metric-soil_moisture_pct").textContent).toBe(
      "45 %",
    );
    expect(screen.getByTestId("ecowitt-metric-co2_ppm").textContent).toBe(
      "966 ppm",
    );
    expect(screen.getByTestId("ecowitt-metric-vpd_kpa").textContent).toMatch(
      /kPa/,
    );
  });

  it("shows empty state when no EcoWitt data exists", async () => {
    rowsMock = [];
    render(<EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />, {
      wrapper: wrap(),
    });
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-snapshot-empty")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        "No EcoWitt readings yet. Send a local test payload to verify the integration.",
      ),
    ).toBeInTheDocument();
  });

  it('shows "Local Test Payload" badge when metadata.test_sender is true', async () => {
    rowsMock = [
      ecowittRow({
        raw_payload: {
          vendor: "ecowitt",
          temp1f: 78.6,
          humidity1: 56,
          dateutc: FRESH_AT,
          test_sender: true,
          transport: "mqtt_local_test",
        },
      }),
    ];
    render(<EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />, {
      wrapper: wrap(),
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("ecowitt-test-sender-badge"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("ecowitt-test-sender-badge").textContent,
    ).toBe("Local Test Payload");
    expect(screen.getByTestId("ecowitt-transport").textContent).toBe(
      "Transport: mqtt_local_test",
    );
  });

  it("displays stale/fresh status using existing logic", async () => {
    rowsMock = [
      ecowittRow({
        captured_at: STALE_AT,
        raw_payload: {
          vendor: "ecowitt",
          temp1f: 77,
          humidity1: 55,
          dateutc: STALE_AT,
        },
      }),
    ];
    render(<EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />, {
      wrapper: wrap(),
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("ecowitt-snapshot-freshness"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("ecowitt-snapshot-freshness").textContent).toBe(
      "stale",
    );
    expect(screen.getByTestId("ecowitt-source-badge").textContent).toBe(
      "Stale",
    );
  });

  it("shows tent name when provided", async () => {
    rowsMock = [ecowittRow({})];
    render(
      <EcowittLatestSnapshotCard
        tentId={TENT_A}
        tentName="Tent Alpha"
        now={NOW}
      />,
      { wrapper: wrap() },
    );
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-tent-name")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("ecowitt-tent-name").textContent).toBe(
      "Tent Alpha",
    );
  });
});

// ---------------------------------------------------------------------------
// 2) Source-code safety: no writes, no action_queue, no ingest endpoints.
// ---------------------------------------------------------------------------
describe("EcowittLatestSnapshotCard — source code safety", () => {
  it("component source does not reference action_queue", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/EcowittLatestSnapshotCard.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/action_queue/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.upsert\(/);
  });

  it("component source does not call ingest or write endpoints", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/EcowittLatestSnapshotCard.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/device[_-]?control/i);
  });

  it("hook source does not reference action_queue or ingest writes", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../hooks/useEcowittLatestSnapshot.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/action_queue/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/\.rpc\(/);
  });
});
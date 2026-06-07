/**
 * EcoWitt latest snapshot UI — wiring tests.
 *
 * Validates the full presenter path:
 *   sensor_readings rows (mocked)
 *     → useEcowittLatestSnapshot
 *     → EcowittLatestSnapshotCard
 *
 * Read-only. No writes, no edge function invokes, no device control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { buildEcowittSnapshotFromRows } from "@/hooks/useEcowittLatestSnapshot";
import { EcowittLatestSnapshotCard } from "@/components/EcowittLatestSnapshotCard";

const TENT_A = "11111111-1111-1111-1111-111111111111";
const TENT_B = "22222222-2222-2222-2222-222222222222";
const PLANT_X = "33333333-3333-3333-3333-333333333333";
const NOW = new Date("2026-06-04T12:30:00Z");
const FRESH_AT = "2026-06-04T12:20:00Z";
const OLDER_AT = "2026-06-04T11:50:00Z";
const STALE_AT = "2026-06-04T08:00:00Z";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
let rowsMock: Array<Record<string, unknown>> = [];
let queryError: { message: string } | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () =>
        queryError
          ? Promise.resolve({ data: null, error: queryError })
          : Promise.resolve({ data: rowsMock, error: null }),
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
  queryError = null;
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
// 1) Pure adapter: rows → view-model
// ---------------------------------------------------------------------------
describe("buildEcowittSnapshotFromRows — pure wiring", () => {
  it("groups persisted EcoWitt rows into one snapshot for the selected tent", () => {
    const vm = buildEcowittSnapshotFromRows(
      [ecowittRow({})],
      { tentId: TENT_A, now: NOW },
    );
    expect(vm?.hasReading).toBe(true);
    expect(vm?.metrics.temp_f).toBeCloseTo(77, 0);
    expect(vm?.metrics.humidity_pct).toBe(55);
    expect(vm?.derivedVpdKpa).not.toBeNull();
  });

  it("ignores newer rows from a different tent", () => {
    const vm = buildEcowittSnapshotFromRows(
      [
        ecowittRow({
          tent_id: TENT_B,
          captured_at: FRESH_AT,
          raw_payload: {
            vendor: "ecowitt",
            temp1f: 95,
            humidity1: 80,
            dateutc: FRESH_AT,
          },
        }),
        ecowittRow({
          tent_id: TENT_A,
          captured_at: OLDER_AT,
          raw_payload: {
            vendor: "ecowitt",
            temp1f: 77,
            humidity1: 55,
            dateutc: OLDER_AT,
          },
        }),
      ],
      { tentId: TENT_A, now: NOW },
    );
    expect(vm?.hasReading).toBe(true);
    expect(vm?.metrics.humidity_pct).toBe(55);
  });

  it("filters by plant_id when provided", () => {
    const vm = buildEcowittSnapshotFromRows(
      [
        ecowittRow({ plant_id: null, raw_payload: { vendor: "ecowitt", temp1f: 95, humidity1: 80, dateutc: FRESH_AT } }),
        ecowittRow({ plant_id: PLANT_X }),
      ],
      { tentId: TENT_A, plantId: PLANT_X, now: NOW },
    );
    expect(vm?.metrics.humidity_pct).toBe(55);
  });

  it("returns null when tentId is missing (never builds orphan snapshots)", () => {
    const vm = buildEcowittSnapshotFromRows([ecowittRow({})], {
      tentId: null,
      now: NOW,
    });
    expect(vm).toBeNull();
  });

  it("returns empty-state view-model when no rows match the selected tent", () => {
    const vm = buildEcowittSnapshotFromRows([ecowittRow({ tent_id: TENT_B })], {
      tentId: TENT_A,
      now: NOW,
    });
    expect(vm?.hasReading).toBe(false);
    expect(vm?.emptyStateMessage).toBe("No EcoWitt readings received yet.");
  });

  it("manual EcoWitt row stays Manual, never Live", () => {
    const vm = buildEcowittSnapshotFromRows(
      [ecowittRow({ source: "manual" })],
      { tentId: TENT_A, now: NOW },
    );
    expect(vm?.sourceLabel?.label).toBe("Manual");
  });

  it("stale EcoWitt row demotes Live → Stale", () => {
    const vm = buildEcowittSnapshotFromRows(
      [
        ecowittRow({
          captured_at: STALE_AT,
          raw_payload: {
            vendor: "ecowitt",
            temp1f: 77,
            humidity1: 55,
            dateutc: STALE_AT,
          },
        }),
      ],
      { tentId: TENT_A, now: NOW },
    );
    expect(vm?.sourceLabel?.label).toBe("Stale");
  });

  it("invalid EcoWitt row renders unavailable, derived VPD null", () => {
    const vm = buildEcowittSnapshotFromRows(
      [
        ecowittRow({
          raw_payload: {
            vendor: "ecowitt",
            temp1f: 77,
            humidity1: 250, // impossible RH
            dateutc: FRESH_AT,
          },
        }),
      ],
      { tentId: TENT_A, now: NOW },
    );
    expect(vm?.invalid).toBe(true);
    expect(vm?.derivedVpdKpa).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2) Component render via mocked Supabase
// ---------------------------------------------------------------------------
describe("EcowittLatestSnapshotCard — render", () => {
  it("renders empty state when no EcoWitt rows exist for the tent", async () => {
    rowsMock = [];
    render(<EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />, {
      wrapper: wrap(),
    });
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-snapshot-empty")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("No EcoWitt readings received yet."),
    ).toBeInTheDocument();
  });

  it("renders error state with retry-friendly copy on query failure", async () => {
    queryError = { message: "boom" };
    render(<EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />, {
      wrapper: wrap(),
    });
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-snapshot-error")).toBeInTheDocument(),
    );
    expect(screen.getByRole("alert").textContent).toMatch(/try again/i);
  });

  it("renders fresh EcoWitt reading with Ecowitt source badge and Derived VPD", async () => {
    rowsMock = [ecowittRow({})];
    render(<EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />, {
      wrapper: wrap(),
    });
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-source-badge")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("ecowitt-source-badge").textContent).toBe(
      "Ecowitt",
    );
    expect(screen.getByTestId("ecowitt-metric-derived-vpd").textContent).toMatch(
      /kPa/,
    );
    expect(screen.getByText("Derived VPD")).toBeInTheDocument();
  });

  it("stale row renders Stale badge and not Live", async () => {
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
      expect(screen.getByTestId("ecowitt-source-badge").textContent).toBe(
        "Stale",
      ),
    );
    expect(screen.queryByText(/^Live$/)).toBeNull();
  });

  it("invalid row renders Invalid / Unavailable and VPD Unavailable", async () => {
    rowsMock = [
      ecowittRow({
        raw_payload: {
          vendor: "ecowitt",
          temp1f: 77,
          humidity1: 250,
          dateutc: FRESH_AT,
        },
      }),
    ];
    render(<EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />, {
      wrapper: wrap(),
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("ecowitt-snapshot-unavailable"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("ecowitt-metric-derived-vpd").textContent,
    ).toBe("Unavailable");
  });

  it("manual EcoWitt row renders Manual badge, never Live", async () => {
    rowsMock = [ecowittRow({ source: "manual" })];
    render(<EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />, {
      wrapper: wrap(),
    });
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-source-badge").textContent).toBe(
        "Manual",
      ),
    );
  });

  it("never renders 'Live VPD' or 'VPD Live'", async () => {
    rowsMock = [ecowittRow({})];
    const { container } = render(
      <EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />,
      { wrapper: wrap() },
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("ecowitt-latest-snapshot-card"),
      ).toBeInTheDocument(),
    );
    expect(container.textContent ?? "").not.toMatch(/Live VPD|VPD Live/i);
  });
});

// ---------------------------------------------------------------------------
// 3) Source-code safety scan
// ---------------------------------------------------------------------------
describe("EcoWitt latest snapshot UI — source code safety", () => {
  const hookSrc = readFileSync(
    resolve(process.cwd(), "src/hooks/useEcowittLatestSnapshot.ts"),
    "utf8",
  );
  const cardSrc = readFileSync(
    resolve(process.cwd(), "src/components/EcowittLatestSnapshotCard.tsx"),
    "utf8",
  );

  it("hook is read-only (no insert/update/delete/upsert/rpc/invoke)", () => {
    expect(hookSrc).not.toMatch(/\.insert\(/);
    expect(hookSrc).not.toMatch(/\.update\(/);
    expect(hookSrc).not.toMatch(/\.delete\(/);
    expect(hookSrc).not.toMatch(/\.upsert\(/);
    expect(hookSrc).not.toMatch(/\.rpc\(/);
    expect(hookSrc).not.toMatch(/functions\.invoke/);
  });

  it("hook scopes by tent_id and never writes to alerts/action_queue", () => {
    expect(hookSrc).toContain('.eq("tent_id"');
    expect(hookSrc).not.toMatch(/from\(["']alerts["']\)/);
    expect(hookSrc).not.toMatch(/from\(["']action_queue["']\)/);
  });

  it("card has no service-role usage and no device-control calls", () => {
    // Look for actual API usage rather than the literal token in comments.
    expect(cardSrc).not.toMatch(/SERVICE_ROLE_KEY/);
    expect(cardSrc).not.toMatch(/device[_-]?control\(/i);
    expect(hookSrc).not.toMatch(/SERVICE_ROLE_KEY/);
  });

  it("card uses ECOWITT_DERIVED_VPD_LABEL and never renders Live-VPD strings", () => {
    expect(cardSrc).toContain("ECOWITT_DERIVED_VPD_LABEL");
    // Strip JSDoc/line comments before scanning for forbidden user-visible text.
    const code = cardSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/Live VPD|VPD Live/);
  });
});

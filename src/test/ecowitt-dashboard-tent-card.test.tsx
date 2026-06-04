/**
 * EcoWitt latest snapshot card wiring into Dashboard and TentDetail.
 *
 * Validates:
 *  - Dashboard imports and uses EcowittLatestSnapshotCard with tentSelection.
 *  - TentDetail imports and uses EcowittLatestSnapshotCard with id.
 *  - Audit link points to /sensors/ecowitt-audit.
 *  - Source-code safety (no forbidden patterns).
 *
 * Read-only. No writes, no automation, no device control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EcowittLatestSnapshotCard } from "@/components/EcowittLatestSnapshotCard";

const TENT_A = "11111111-1111-1111-1111-111111111111";
const TENT_B = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-06-04T12:30:00Z");
const FRESH_AT = "2026-06-04T12:20:00Z";
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
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
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
// Source-code wiring assertions
// ---------------------------------------------------------------------------
const readSrc = (p: string) =>
  readFileSync(resolve(__dirname, "..", p), "utf8");

const DASHBOARD_SRC = readSrc("pages/Dashboard.tsx");
const TENT_DETAIL_SRC = readSrc("pages/TentDetail.tsx");

describe("Dashboard EcoWitt wiring — source code", () => {
  it("imports EcowittLatestSnapshotCard", () => {
    expect(DASHBOARD_SRC).toMatch(
      /import\s+EcowittLatestSnapshotCard\s+from\s+["']@\/components\/EcowittLatestSnapshotCard["']/,
    );
  });

  it("renders the card with the selected tent id (not 'all')", () => {
    expect(DASHBOARD_SRC).toContain('<EcowittLatestSnapshotCard');
    expect(DASHBOARD_SRC).toContain('tentId={tentSelection}');
    // Must not render the card when selection is "all" — instead show the calm copy.
    expect(DASHBOARD_SRC).toMatch(
      /tentSelection\s*===\s*["']all["']\s*\?/,
    );
  });

  it("shows calm 'Select a tent' copy when no tent is selected", () => {
    expect(DASHBOARD_SRC).toMatch(/Select a tent to view EcoWitt readings/);
  });

  it("labels the section 'Latest EcoWitt Snapshot'", () => {
    expect(DASHBOARD_SRC).toMatch(/Latest EcoWitt Snapshot/);
  });

  it("does not remove existing manual/latest snapshot UI", () => {
    // Original "Latest Environment" section must still exist.
    expect(DASHBOARD_SRC).toMatch(/Latest Environment/);
    // Original sensor snapshot section must still exist.
    expect(DASHBOARD_SRC).toMatch(/Environment Snapshot/);
  });
});

describe("TentDetail EcoWitt wiring — source code", () => {
  it("imports EcowittLatestSnapshotCard", () => {
    expect(TENT_DETAIL_SRC).toMatch(
      /import\s+EcowittLatestSnapshotCard\s+from\s+["']@\/components\/EcowittLatestSnapshotCard["']/,
    );
  });

  it("renders the card with the viewed tent id", () => {
    expect(TENT_DETAIL_SRC).toContain('<EcowittLatestSnapshotCard');
    expect(TENT_DETAIL_SRC).toContain('tentId={id ?? null}');
  });

  it("labels the section 'Latest EcoWitt Snapshot'", () => {
    expect(TENT_DETAIL_SRC).toMatch(/Latest EcoWitt Snapshot/);
  });

  it("does not remove existing manual sensor UI", () => {
    expect(TENT_DETAIL_SRC).toMatch(/Environment/);
    expect(TENT_DETAIL_SRC).toContain("TentManualSnapshotHistoryList");
    expect(TENT_DETAIL_SRC).toContain("ManualSnapshotTimelineSection");
  });
});

// ---------------------------------------------------------------------------
// Card render tests (behavior already validated at card level; re-exercise
// here to confirm the audit link and that the card still works as wired).
// ---------------------------------------------------------------------------
describe("EcowittLatestSnapshotCard — audit link and behavior", () => {
  it("renders audit link pointing to /sensors/ecowitt-audit", async () => {
    rowsMock = [ecowittRow({})];
    render(
      <MemoryRouter>
        <EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />
      </MemoryRouter>,
      { wrapper: wrap() },
    );
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-audit-link")).toBeInTheDocument(),
    );
    const link = screen.getByTestId("ecowitt-audit-link");
    expect(link.getAttribute("href")).toBe("/sensors/ecowitt-audit");
    expect(link.textContent).toBe("View EcoWitt ingest audit");
  });

  it("empty state still renders with audit link visible", async () => {
    rowsMock = [];
    render(
      <MemoryRouter>
        <EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />
      </MemoryRouter>,
      { wrapper: wrap() },
    );
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-snapshot-empty")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("ecowitt-audit-link")).toBeInTheDocument();
  });

  it("stale reading renders Stale badge, not Live", async () => {
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
    render(
      <MemoryRouter>
        <EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />
      </MemoryRouter>,
      { wrapper: wrap() },
    );
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-source-badge")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("ecowitt-source-badge").textContent).toBe(
      "Stale",
    );
    expect(screen.queryByText(/^Live$/)).toBeNull();
  });

  it("manual source renders Manual, never Live", async () => {
    rowsMock = [ecowittRow({ source: "manual" })];
    render(
      <MemoryRouter>
        <EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />
      </MemoryRouter>,
      { wrapper: wrap() },
    );
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-source-badge")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("ecowitt-source-badge").textContent).toBe(
      "Manual",
    );
  });

  it("invalid reading renders Invalid / Unavailable and Derived VPD unavailable", async () => {
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
    render(
      <MemoryRouter>
        <EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />
      </MemoryRouter>,
      { wrapper: wrap() },
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("ecowitt-snapshot-unavailable"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("ecowitt-metric-derived-vpd").textContent,
    ).toBe("Unavailable");
  });

  it("never renders 'Live VPD' or 'VPD Live'", async () => {
    rowsMock = [ecowittRow({})];
    const { container } = render(
      <MemoryRouter>
        <EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />
      </MemoryRouter>,
      { wrapper: wrap() },
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("ecowitt-latest-snapshot-card"),
      ).toBeInTheDocument(),
    );
    expect(container.textContent ?? "").not.toMatch(/Live VPD|VPD Live/i);
  });

  it("Derived VPD label is always 'Derived VPD'", async () => {
    rowsMock = [ecowittRow({})];
    render(
      <MemoryRouter>
        <EcowittLatestSnapshotCard tentId={TENT_A} now={NOW} />
      </MemoryRouter>,
      { wrapper: wrap() },
    );
    await waitFor(() =>
      expect(screen.getByText("Derived VPD")).toBeInTheDocument(),
    );
  });
});

// ---------------------------------------------------------------------------
// Source-code safety scans
// ---------------------------------------------------------------------------
describe("Dashboard / TentDetail — source code safety", () => {
  it("Dashboard has no service_role key references", () => {
    expect(DASHBOARD_SRC).not.toMatch(/SERVICE_ROLE_KEY/);
  });

  it("TentDetail has no service_role key references", () => {
    expect(TENT_DETAIL_SRC).not.toMatch(/SERVICE_ROLE_KEY/);
  });

  it("Dashboard has no functions.invoke calls", () => {
    expect(DASHBOARD_SRC).not.toMatch(/functions\.invoke/);
  });

  it("TentDetail has no functions.invoke calls", () => {
    expect(TENT_DETAIL_SRC).not.toMatch(/functions\.invoke/);
  });

  const FORBIDDEN_BRAND = new RegExp("switch" + "bot", "i");

  it("Dashboard has no forbidden brand references", () => {
    expect(DASHBOARD_SRC).not.toMatch(FORBIDDEN_BRAND);
  });

  it("TentDetail has no forbidden brand references", () => {
    expect(TENT_DETAIL_SRC).not.toMatch(FORBIDDEN_BRAND);
  });

  it("Dashboard does not write to alerts or action_queue in UI code", () => {
    // Use .from() calls as a proxy — the persist hook lives in a separate file.
    expect(DASHBOARD_SRC).not.toMatch(/from\(["']alerts["']\)/);
    expect(DASHBOARD_SRC).not.toMatch(/from\(["']action_queue["']\)/);
  });

  it("TentDetail does not write to alerts or action_queue in UI code", () => {
    expect(TENT_DETAIL_SRC).not.toMatch(/from\(["']alerts["']\)/);
    expect(TENT_DETAIL_SRC).not.toMatch(/from\(["']action_queue["']\)/);
  });

  it("Dashboard has no device-control strings", () => {
    expect(DASHBOARD_SRC).not.toMatch(/device[_-]?control/i);
  });

  it("TentDetail has no device-control strings", () => {
    expect(TENT_DETAIL_SRC).not.toMatch(/device[_-]?control/i);
  });
});

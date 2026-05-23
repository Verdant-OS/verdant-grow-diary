/**
 * Wiring tests: Dashboard and Grow-Room Mode render the simulated-source
 * disclosure when the latest snapshot source is "sim", and never label
 * sim readings as Live.
 *
 * Pure UI wiring tests + static safety guardrails.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardDataSourceDisclosure from "@/components/DashboardDataSourceDisclosure";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const GRM = readFileSync(resolve(ROOT, "src/pages/GrowRoomMode.tsx"), "utf8");

const meta = (
  dataSource: GrowDataSourceMeta["dataSource"],
  isDemoData = dataSource === "mock" || dataSource === "mixed",
): GrowDataSourceMeta => ({ isDemoData, dataSource, sourceReason: "test" });

describe("DashboardDataSourceDisclosure snapshotSource prop", () => {
  it("renders Simulated badge and notice when snapshotSource is sim", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData
        metas={[meta("supabase", false)]}
        snapshotSource="sim"
      />,
    );
    expect(
      screen.getByTestId("dashboard-data-source-simulated-badge"),
    ).toHaveTextContent(/simulated/i);
    expect(
      screen.getByTestId("dashboard-data-source-simulated-notice"),
    ).toHaveTextContent(/testing\/demo only/i);
    expect(
      screen.getByTestId("dashboard-data-source-simulated-notice"),
    ).toHaveTextContent(/not real tent data/i);
    expect(
      screen.getByTestId("dashboard-data-source-simulated-notice"),
    ).toHaveTextContent(/not used for persisted alerts/i);
  });

  it("does not render simulated notice when snapshotSource is live", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData
        metas={[meta("supabase", false)]}
        snapshotSource="live"
      />,
    );
    expect(
      screen.queryByTestId("dashboard-data-source-simulated-badge"),
    ).toBeNull();
    expect(
      screen.queryByTestId("dashboard-data-source-simulated-notice"),
    ).toBeNull();
  });

  it("does not render simulated notice when snapshotSource is manual", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData
        metas={[meta("supabase", false)]}
        snapshotSource="manual"
      />,
    );
    expect(
      screen.queryByTestId("dashboard-data-source-simulated-badge"),
    ).toBeNull();
  });
});

describe("Dashboard.tsx wiring", () => {
  it("passes sensor snapshot source into DashboardDataSourceDisclosure", () => {
    expect(DASHBOARD).toMatch(/<DashboardDataSourceDisclosure[\s\S]*?snapshotSource=/);
    expect(DASHBOARD).toMatch(/sensorState\.snapshot\.source/);
  });
});

// --- Grow-Room Mode wiring (page render) ---

const SIM_READINGS = [
  { tent_id: "t1", metric: "temp", value: 24, ts: new Date().toISOString(), source: "sim", quality: "ok" },
  { tent_id: "t1", metric: "rh", value: 55, ts: new Date().toISOString(), source: "sim", quality: "ok" },
];

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "t1", name: "Sim Tent", grow_id: "g1" }],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ alerts: [], isLoading: false, error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({
                data: table === "sensor_readings" ? SIM_READINGS : [],
                error: null,
              }),
          }),
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

import GrowRoomMode from "@/pages/GrowRoomMode";

describe("GrowRoomMode sim-source card disclosure", () => {
  it("renders Simulated badge and notice for sim snapshot, never Live", async () => {
    render(
      <MemoryRouter>
        <GrowRoomMode />
      </MemoryRouter>,
    );
    const badge = await screen.findByTestId("grow-room-simulated-badge");
    expect(badge).toHaveTextContent(/simulated/i);
    const notice = screen.getByTestId("grow-room-simulated-notice");
    expect(notice).toHaveTextContent(/testing\/demo only/i);
    expect(notice).toHaveTextContent(/not real tent data/i);
    expect(notice).toHaveTextContent(/not used for persisted alerts/i);
    // Must not label sim as Live anywhere on the card
    const card = screen.getByTestId("grow-room-card");
    expect(card.textContent ?? "").not.toMatch(/\blive\b/i);
  });
});

describe("Static safety: Dashboard + GrowRoomMode wiring", () => {
  const FORBIDDEN_WRITES = /\.(insert|update|delete|upsert|rpc)\s*\(/;
  const FORBIDDEN_STRINGS =
    /service_role|action_queue\s*=|automation|device[\s_-]?control|\bmqtt\b|home[\s_-]?assistant|pi[\s_-]?bridge/i;

  it("Dashboard wiring adds no writes or forbidden surfaces", () => {
    // Dashboard pre-existing code may reference action_queue indirectly; we
    // restrict to ensuring no write verbs and no forbidden integration strings.
    expect(DASHBOARD).not.toMatch(FORBIDDEN_WRITES);
    expect(DASHBOARD).not.toMatch(FORBIDDEN_STRINGS);
  });

  it("GrowRoomMode wiring adds no writes or forbidden surfaces", () => {
    expect(GRM).not.toMatch(FORBIDDEN_WRITES);
    expect(GRM).not.toMatch(FORBIDDEN_STRINGS);
  });
});

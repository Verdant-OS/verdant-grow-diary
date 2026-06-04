/**
 * Audit + smoke tests for the Alerts Center real alert generation loop.
 *
 * Covers:
 *   - Alerts page empty state copy (spec wording)
 *   - Static safety of the new `AlertsAutoPersistForGrow` trigger gate
 *   - Pure-rules behavior of the alert engine + persistence guard:
 *       * humidity breach → derived + persistable alert
 *       * temperature breach → derived + persistable alert
 *       * VPD out-of-range → derived + persistable alert
 *       * in-range readings → no alert
 *       * stale snapshot → never persistable
 *       * demo/unavailable snapshot → never persistable
 *       * duplicate open alert is deduped
 *
 * No writes are exercised here; persistence flows through the existing
 * `usePersistEnvironmentAlerts` hook covered by its own tests. These tests
 * lock the contract that the Alerts page wires the trigger and that the
 * rules layer is honest about demo/stale/unavailable inputs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Alerts from "@/pages/Alerts";
import {
  buildEnvironmentAlerts,
  type EnvironmentAlert,
} from "@/lib/environmentAlerts";
import {
  isSnapshotPersistable,
  selectPersistableAlerts,
  dedupeAgainstOpen,
  derivedAlertKey,
} from "@/lib/environmentAlertPersistence";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { evaluateSensorQuality } from "@/lib/sensorQuality";

const ROOT = resolve(__dirname, "../..");
const ALERTS_PAGE = readFileSync(
  resolve(ROOT, "src/pages/Alerts.tsx"),
  "utf8",
);
const PERSIST_GATE = readFileSync(
  resolve(ROOT, "src/components/AlertsAutoPersistForGrow.tsx"),
  "utf8",
);
const PERSIST_HOOK = readFileSync(
  resolve(ROOT, "src/hooks/usePersistEnvironmentAlerts.ts"),
  "utf8",
);

const FRESH = new Date().toISOString();
const STALE = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function manualSnap(over: Partial<{ temp: number; rh: number; vpd: number; ts: string }> = {}) {
  return {
    source: "manual" as const,
    ts: over.ts ?? FRESH,
    temp: over.temp ?? 24,
    rh: over.rh ?? 50,
    vpd: over.vpd ?? null,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
  };
}

const targets = {
  temp: { min: 20, max: 28 },
  rh: { min: 40, max: 55 },
  vpd: { min: 0.8, max: 1.5 },
};

// ---------------------------------------------------------------------------
// Pure rules — real breach smoke tests
// ---------------------------------------------------------------------------
describe("alert engine — real breach detection", () => {
  it("derives a high-humidity alert when manual RH (65) exceeds rh_max (55) and it is persistable", () => {
    const snap = manualSnap({ rh: 65 });
    const cmp = compareSnapshotToTargets(snap, targets);
    const quality = evaluateSensorQuality(snap);
    const derived = buildEnvironmentAlerts({
      snapshot: snap,
      quality,
      targets: cmp,
    });
    expect(derived.some((a) => /humidity|rh/i.test(a.title))).toBe(true);
    const persistable = selectPersistableAlerts(derived, {
      snapshot: snap,
      quality: quality.quality,
    });
    expect(persistable.length).toBeGreaterThan(0);
  });

  it("derives a high-temperature alert when manual temp (32) exceeds temp_max (28)", () => {
    const snap = manualSnap({ temp: 32 });
    const cmp = compareSnapshotToTargets(snap, targets);
    const quality = evaluateSensorQuality(snap);
    const derived = buildEnvironmentAlerts({
      snapshot: snap,
      quality,
      targets: cmp,
    });
    expect(derived.some((a) => /temperature|temp/i.test(a.title))).toBe(true);
    expect(
      selectPersistableAlerts(derived, {
        snapshot: snap,
        quality: quality.quality,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("derives a VPD alert when VPD is well out of range", () => {
    const snap = manualSnap({ vpd: 2.4 });
    const cmp = compareSnapshotToTargets(snap, targets);
    const quality = evaluateSensorQuality(snap);
    const derived = buildEnvironmentAlerts({
      snapshot: snap,
      quality,
      targets: cmp,
    });
    expect(derived.some((a) => /vpd/i.test(a.title))).toBe(true);
  });

  it("does NOT derive a persistable breach alert for in-range readings", () => {
    const snap = manualSnap({ temp: 24, rh: 50, vpd: 1.1 });
    const cmp = compareSnapshotToTargets(snap, targets);
    const quality = evaluateSensorQuality(snap);
    const derived = buildEnvironmentAlerts({
      snapshot: snap,
      quality,
      targets: cmp,
    });
    const persistable = selectPersistableAlerts(derived, {
      snapshot: snap,
      quality: quality.quality,
    });
    expect(persistable.length).toBe(0);
  });
});

describe("alert persistence — source-truth guards", () => {
  it("never persists from a stale snapshot", () => {
    const snap = manualSnap({ ts: STALE, rh: 65 });
    expect(
      isSnapshotPersistable({
        snapshot: snap,
        quality: "good",
      }),
    ).toBe(false);
  });

  it("never persists demo/fallback snapshots", () => {
    const snap = manualSnap({ rh: 65 });
    expect(
      isSnapshotPersistable({
        snapshot: snap,
        quality: "good",
        isDemoData: true,
      }),
    ).toBe(false);
  });

  it("never persists when there is no snapshot", () => {
    expect(
      isSnapshotPersistable({ snapshot: null, quality: "unavailable" }),
    ).toBe(false);
  });

  it("dedupes a derived alert against an existing open row for the same rule/scope", () => {
    const alert: EnvironmentAlert = {
      id: "env:humidity:high",
      severity: "warning",
      metric: "humidity_pct",
      title: "Humidity above target",
      reason: "RH 65% above 55%",
      source: "sensor_snapshot",
      createdAt: FRESH,
    };
    const openRow = {
      metric: "humidity_pct",
      source: "environment_alerts",
      title: "Humidity above target",
    };
    expect(derivedAlertKey(alert)).toBe(
      `environment_alerts::humidity_pct::humidity above target`,
    );
    expect(dedupeAgainstOpen([alert], [openRow]).length).toBe(0);
    expect(dedupeAgainstOpen([alert], []).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Alerts page — empty-state render + auto-persist wiring (smoke)
// ---------------------------------------------------------------------------
const listAlertsMock = vi.fn();

vi.mock("@/lib/alerts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/alerts")>(
    "@/lib/alerts",
  );
  return {
    ...actual,
    listAlerts: (...args: unknown[]) => listAlertsMock(...args),
    acknowledgeAlert: vi.fn(),
    resolveAlert: vi.fn(),
    dismissAlert: vi.fn(),
    logAlertEvent: vi.fn(),
    saveAlert: vi.fn(),
  };
});

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
    then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
      resolve({ data: [], error: null }),
  };
  return { supabase: { from: () => chain } };
});

vi.mock("@/hooks/useAlertEvents", () => ({
  useAlertEvents: () => ({ status: "ok", events: [] }),
}));
vi.mock("@/hooks/useAlertsLinkedActionCounts", () => ({
  useAlertsLinkedActionCounts: () => ({ get: () => undefined }),
}));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({ data: [] }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({ status: "loading" }),
}));
vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => ({ status: "loading" }),
}));
const persistMock = vi.fn();
vi.mock("@/hooks/usePersistEnvironmentAlerts", () => ({
  usePersistEnvironmentAlerts: (input: unknown) => {
    persistMock(input);
    return { status: "skipped", persistedCount: 0, lastError: null };
  },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" } }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "G1", stage: "veg" }],
    activeGrowId: "g1",
    activeGrow: { id: "g1", name: "G1", stage: "veg" },
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

beforeEach(() => {
  listAlertsMock.mockReset();
  persistMock.mockReset();
});

describe("Alerts page — empty state + auto-persist wiring", () => {
  it("renders the spec empty-state copy when no alerts exist", async () => {
    listAlertsMock.mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Alerts />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("No open alerts.")).toBeTruthy(),
    );
    expect(
      screen.getByText(
        /Alerts will appear when real or manual readings breach your grow targets\./,
      ),
    ).toBeTruthy();
  });

  it("mounts the auto-persist gate for the active grow when no URL scope is set", async () => {
    listAlertsMock.mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Alerts />
      </MemoryRouter>,
    );
    await waitFor(() => expect(persistMock).toHaveBeenCalled());
    const calls = persistMock.mock.calls.map((c) => c[0] as { growId: string | null; enabled: boolean });
    expect(calls.some((c) => c.growId === "g1" && c.enabled === true)).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Static safety
// ---------------------------------------------------------------------------
describe("Alerts page + persist gate — static safety", () => {
  it("Alerts page does not import demo/mock alert fixtures", () => {
    expect(ALERTS_PAGE).not.toMatch(/useMockData|mockAlerts|sampleAlerts|demoAlerts/i);
  });

  it("Alerts page does not inject client-side user_id", () => {
    expect(ALERTS_PAGE).not.toMatch(/user_id\s*:/);
  });

  it("Alerts page contains no service_role / device-control strings / autopilot", () => {
    expect(ALERTS_PAGE).not.toMatch(/service_role/);
    expect(ALERTS_PAGE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator/i,
    );
    expect(ALERTS_PAGE).not.toMatch(/_executed\b/);
    expect(ALERTS_PAGE).not.toMatch(/autopilot/i);
  });

  it("AlertsAutoPersistForGrow gate is side-effect only (no JSX, returns null)", () => {
    expect(PERSIST_GATE).toMatch(/return null/);
    expect(PERSIST_GATE).not.toMatch(/service_role/);
    expect(PERSIST_GATE).not.toMatch(/user_id\s*:/);
    expect(PERSIST_GATE).not.toMatch(/_executed\b/);
    expect(PERSIST_GATE).not.toMatch(/autopilot/i);
    expect(PERSIST_GATE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator/i,
    );
  });

  it("persist hook does not automatically create Action Queue items", () => {
    expect(PERSIST_HOOK).not.toMatch(/action_queue/i);
    expect(PERSIST_HOOK).not.toMatch(/insertActionQueue|createActionQueue/);
    expect(PERSIST_HOOK).not.toMatch(/_executed\b/);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import type { ManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";

const mocks = vi.hoisted(() => ({
  owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  rpc: vi.fn(),
  batch: vi.fn(),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: mocks.owner } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/useInsertSensorReadings", () => ({
  useInsertSensorReadings: () => ({ mutateAsync: mocks.batch, isPending: false }),
}));
vi.mock("@/hooks/useInsertSensorReading", () => ({
  useInsertSensorReading: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useInsertManualSnapshotEdit", () => ({
  insertManualSnapshotEdit: vi.fn(),
  useInsertManualSnapshotEdit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/insertManualSensorReadingReturningId", () => ({
  insertManualSensorReadingReturningId: vi.fn(),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "fahrenheit",
}));

import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { buildManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
import { createManualCorrectionJournal } from "@/lib/manualSensorCorrectionPendingStore";
import { decodeManualCorrectionHash } from "@/lib/manualSensorCorrectionContext";
import { getPendingCorrectionRecovery } from "@/lib/manualSensorCorrectionRecoveryRules";
import {
  createSensorsPageSessionController,
  type SensorsPageSessionController,
} from "@/hooks/useSensorsPageSession";

const tentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherTent = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const observedAt = "2026-09-16T08:00:00.000Z";
const tents = [
  { id: tentId, name: "Original tent" },
  { id: otherTent, name: "Other tent" },
];

function pendingOperation(): ManualCorrectionOperation {
  const result = buildManualCorrectionOperation({
    operationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    correction: {
      tentId,
      originalCapturedAt: observedAt,
      originalReadingIds: {
        temperature_c: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        humidity_pct: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      },
      originalValues: { temperature_c: 24, humidity_pct: 55 },
    },
    metrics: [
      { metric: "temperature_c", value: 26 },
      { metric: "humidity_pct", value: 60 },
    ],
  });
  if (!result.ok) throw new Error("invalid correction fixture");
  return result.operation;
}

function SessionHarness({ session }: { session: SensorsPageSessionController }) {
  const location = useLocation();
  return (
    <ManualSensorReadingCard
      tents={tents}
      defaultTentId={new URLSearchParams(location.search).get("tentId") ?? tentId}
      correction={decodeManualCorrectionHash(location.hash)}
      session={session}
    />
  );
}

const clients: QueryClient[] = [];
function mountSession(entry: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const session = createSensorsPageSessionController(client, mocks.owner);
  if (!session) throw new Error("expected session controller");
  session.reconcileSelection({
    intent: { tentId, requireExactMatch: true },
    intentKey: "correction-recovery-celsius-session",
    tents,
    tentsLoaded: true,
  });
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SessionHarness session={session} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  expect(createManualCorrectionJournal().claim(mocks.owner, pendingOperation()).status).toBe(
    "claimed",
  );
});

describe("correction recovery session draft under Fahrenheit preference", () => {
  it("initializes the session draft with canonical 26°C digits and C active", async () => {
    const recovery = getPendingCorrectionRecovery(
      createManualCorrectionJournal().read(mocks.owner),
      [tentId, otherTent],
      null,
    );
    if (recovery.status !== "available")
      throw new Error("expected pending correction recovery link");

    const view = mountSession(recovery.href);

    await waitFor(() =>
      expect(view.getByTestId("manual-reading-correction-banner")).toBeInTheDocument(),
    );
    const airTemp = view.container.querySelector("#m-air-temp") as HTMLInputElement;
    expect(airTemp.value).toBe("26");
    expect(airTemp.value).not.toBe("78.8");
    expect(view.getByTestId("manual-reading-temp-unit-C")).toHaveAttribute("aria-pressed", "true");
    expect(view.getByLabelText(/Humidity/i)).toHaveValue(60);
    expect(view.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument();
  });
});

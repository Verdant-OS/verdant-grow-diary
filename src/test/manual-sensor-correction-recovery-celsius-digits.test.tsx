import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
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

import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { createManualCorrectionJournal } from "@/lib/manualSensorCorrectionPendingStore";
import { decodeManualCorrectionHash } from "@/lib/manualSensorCorrectionContext";

const tentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherTent = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const observedAt = "2026-09-16T08:00:00.000Z";
const pending: ManualCorrectionOperation = {
  version: 1,
  operationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  tentId,
  observedAt,
  source: "manual",
  originals: [
    {
      metric: "temperature_c",
      readingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      value: 24,
    },
    {
      metric: "humidity_pct",
      readingId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      value: 55,
    },
  ],
  changes: [
    {
      metric: "temperature_c",
      originalReadingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      expectedValue: 24,
      value: 26,
    },
    {
      metric: "humidity_pct",
      originalReadingId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      expectedValue: 55,
      value: 60,
    },
  ],
};

function Harness() {
  const location = useLocation();
  return (
    <ManualSensorReadingCard
      tents={[
        { id: tentId, name: "Original tent" },
        { id: otherTent, name: "Other tent" },
      ]}
      defaultTentId={new URLSearchParams(location.search).get("tentId") ?? otherTent}
      correction={decodeManualCorrectionHash(location.hash)}
    />
  );
}

function mount(entry = "/sensors?tentId=" + otherTent) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Harness />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.removeItem("verdant:temperatureUnit");
  vi.clearAllMocks();
  mocks.owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  expect(createManualCorrectionJournal().claim(mocks.owner, pending).status).toBe("claimed");
});
afterEach(cleanup);

describe("correction recovery under default Fahrenheit preference", () => {
  it("reopens canonical 26°C as digits 26 with C active, not 78.8°F", async () => {
    const view = mount();
    fireEvent.click(view.getByRole("link", { name: "Reopen pending correction" }));
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-correction-banner")).toBeInTheDocument(),
    );
    const airTemp = view.container.querySelector("#m-air-temp") as HTMLInputElement;
    expect(airTemp.value).toBe("26");
    expect(airTemp.value).not.toBe("78.8");
    expect(view.getByTestId("manual-reading-temp-unit-C")).toHaveAttribute("aria-pressed", "true");
    expect(view.getByTestId("manual-reading-temp-unit-F")).toHaveAttribute("aria-pressed", "false");
    expect(view.getByLabelText(/Humidity/i)).toHaveValue(60);
    expect(view.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument();
  });

  it("keeps Celsius digits when Restore pending correction reruns on the same identity", async () => {
    const view = mount();
    fireEvent.click(view.getByRole("link", { name: "Reopen pending correction" }));
    await waitFor(() =>
      expect(view.getByRole("button", { name: "Restore pending correction" })).toBeInTheDocument(),
    );
    fireEvent.change(view.getByLabelText(/Air temp/i), { target: { value: "99" } });
    fireEvent.click(view.getByRole("button", { name: "Restore pending correction" }));
    expect((view.container.querySelector("#m-air-temp") as HTMLInputElement).value).toBe("26");
    expect(view.getByTestId("manual-reading-temp-unit-C")).toHaveAttribute("aria-pressed", "true");
    expect(view.getByLabelText(/Humidity/i)).toHaveValue(60);
  });
});

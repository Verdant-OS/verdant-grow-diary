import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import type { ManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";

const mocks = vi.hoisted(() => ({
  owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  rpc: vi.fn(),
  insert: vi.fn(),
  batch: vi.fn(),
  edit: vi.fn(),
  replacement: vi.fn(),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: mocks.owner } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/useInsertSensorReading", () => ({
  useInsertSensorReading: () => ({ mutateAsync: mocks.insert, isPending: false }),
}));
vi.mock("@/hooks/useInsertSensorReadings", () => ({
  useInsertSensorReadings: () => ({ mutateAsync: mocks.batch, isPending: false }),
}));
vi.mock("@/lib/insertManualSensorReadingReturningId", () => ({
  insertManualSensorReadingReturningId: mocks.replacement,
}));
vi.mock("@/hooks/useInsertManualSnapshotEdit", () => ({ insertManualSnapshotEdit: mocks.edit }));
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
    { metric: "humidity_pct", readingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", value: 55 },
  ],
  changes: [
    {
      metric: "humidity_pct",
      originalReadingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      expectedValue: 55,
      value: 60,
    },
  ],
};
function Harness({ available = true }: { available?: boolean }) {
  const location = useLocation();
  return (
    <ManualSensorReadingCard
      tents={
        available
          ? [
              { id: tentId, name: "Original tent" },
              { id: otherTent, name: "Other tent" },
            ]
          : [{ id: otherTent, name: "Other tent" }]
      }
      defaultTentId={new URLSearchParams(location.search).get("tentId") ?? otherTent}
      correction={decodeManualCorrectionHash(location.hash)}
    />
  );
}
function mount(available = true) {
  return render(
    <MemoryRouter initialEntries={["/sensors?tentId=" + otherTent]}>
      <Harness available={available} />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  expect(createManualCorrectionJournal().claim(mocks.owner, pending).status).toBe("claimed");
  mocks.rpc.mockReset().mockImplementation(async (_name, { p_request }) => ({
    data: {
      operationId: p_request.operationId,
      observedAt: p_request.observedAt,
      changedAt: "2026-09-17T12:00:00.000Z",
      revision: 1,
      reused: true,
      request: p_request,
      changes: p_request.changes.map((c: ManualCorrectionOperation["changes"][number]) => ({
        metric: c.metric,
        readingId: c.originalReadingId,
        previousValue: c.expectedValue,
        value: c.value,
        added: false,
      })),
    },
    error: null,
  }));
});
afterEach(cleanup);
describe("pending correction without its original handoff", () => {
  it("shows a recovery link to the original tent without replacing the current form", () => {
    const view = mount();
    expect(view.getByTestId("manual-reading-pending-correction")).toHaveTextContent(/unconfirmed/i);
    const link = view.getByRole("link", { name: "Reopen pending correction" });
    expect(link.getAttribute("href")).toContain("/sensors?tentId=" + tentId + "#manual-reading?");
    expect(link.getAttribute("href")).not.toContain(mocks.owner);
    expect(view.getByLabelText(/Humidity/i)).toHaveValue(null);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(createManualCorrectionJournal().read(mocks.owner)).toEqual({
      status: "pending",
      operation: pending,
    });
  });
  it("reopens edited values and confirms the exact saved operation only on explicit save", async () => {
    const view = mount();
    fireEvent.click(view.getByRole("link", { name: "Reopen pending correction" }));
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-correction-banner")).toBeInTheDocument(),
    );
    expect(view.getByLabelText(/Humidity/i)).toHaveValue(60);
    expect(view.queryByTestId("manual-reading-pending-correction")).not.toBeInTheDocument();
    expect(view.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(view.getByTestId("manual-reading-save"));
    fireEvent.click(view.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-saved-confirmation")).toBeInTheDocument(),
    );
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_manual_sensor_correction", {
      p_request: pending,
    });
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(createManualCorrectionJournal().read(mocks.owner)).toEqual({ status: "empty" });
  });
  it("does not expose another owner's pending operation", () => {
    mocks.owner = otherTent;
    const view = mount();
    expect(view.queryByTestId("manual-reading-pending-correction")).not.toBeInTheDocument();
    expect(view.queryByRole("link", { name: "Reopen pending correction" })).not.toBeInTheDocument();
  });
  it("does not expose recovery while signed out", () => {
    mocks.owner = "";
    const view = mount();
    expect(view.queryByTestId("manual-reading-pending-correction")).not.toBeInTheDocument();
  });
  it("keeps the operation when its original tent is unavailable", () => {
    const view = mount(false);
    expect(view.getByTestId("manual-reading-pending-correction")).toHaveTextContent(
      /original tent is unavailable/i,
    );
    expect(view.queryByRole("link", { name: "Reopen pending correction" })).not.toBeInTheDocument();
    expect(createManualCorrectionJournal().read(mocks.owner)).toEqual({
      status: "pending",
      operation: pending,
    });
  });
  it("reports an unreadable journal and allows a fresh recovery check", () => {
    const key = "verdant:sensors:pending-correction:v1:" + mocks.owner;
    const valid = sessionStorage.getItem(key)!;
    sessionStorage.setItem(key, "broken");
    const view = mount();
    expect(view.getByTestId("manual-reading-pending-correction")).toHaveTextContent(
      /could not check/i,
    );
    expect(view.queryByRole("link", { name: "Reopen pending correction" })).not.toBeInTheDocument();
    sessionStorage.setItem(key, valid);
    fireEvent.click(view.getByRole("button", { name: "Retry correction recovery" }));
    expect(view.getByRole("link", { name: "Reopen pending correction" })).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("shows no recovery notice for an empty journal", () => {
    sessionStorage.clear();
    const view = mount();
    expect(view.queryByTestId("manual-reading-pending-correction")).not.toBeInTheDocument();
  });
});

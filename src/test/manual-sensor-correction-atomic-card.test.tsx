import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createSensorsPageSessionController } from "@/hooks/useSensorsPageSession";
import { fireEvent, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
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

const tentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const observedAt = "2026-09-16T08:00:00.123456+00:00";
const correction = {
  tentId,
  originalCapturedAt: observedAt,
  originalReadingIds: { humidity_pct: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
  originalValues: { humidity_pct: 55 },
};
function receipt(request: ManualCorrectionOperation) {
  return {
    data: {
      operationId: request.operationId,
      observedAt: request.observedAt,
      changedAt: "2026-09-17T12:00:00.000Z",
      revision: 1,
      reused: false,
      request,
      changes: request.changes.map((row) => ({
        metric: row.metric,
        readingId: row.originalReadingId,
        previousValue: row.expectedValue,
        value: row.value,
        added: false,
      })),
    },
    error: null,
  };
}
const clients: QueryClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});
function mount(withSession = false) {
  const saved = vi.fn();
  const client = new QueryClient();
  clients.push(client);
  const session = withSession ? createSensorsPageSessionController(client, mocks.owner) : null;
  session?.reconcileSelection({
    intent: { tentId, requireExactMatch: true },
    intentKey: "correction-session-test",
    tents: [{ id: tentId }],
    tentsLoaded: true,
  });
  const view = render(
    <MemoryRouter>
      <ManualSensorReadingCard
        tents={[{ id: tentId, name: "Tent A" }]}
        correction={correction}
        onSaved={saved}
        session={session ?? undefined}
      />
    </MemoryRouter>,
  );
  fireEvent.change(view.getByLabelText(/Humidity/i), { target: { value: "60" } });
  fireEvent.click(view.getByTestId("manual-reading-save"));
  fireEvent.click(view.getByTestId("manual-sensor-review-confirm"));
  return { ...view, saved };
}
beforeEach(() => {
  mocks.owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.rpc.mockReset().mockImplementation(async (_name, { p_request }) => receipt(p_request));
  mocks.replacement.mockResolvedValue({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
});
describe("atomic correction form", () => {
  it("uses one complete correction RPC and confirms the original observation time", async () => {
    const view = mount();
    await waitFor(() => expect(view.saved).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe("save_manual_sensor_correction");
    expect(mocks.rpc.mock.calls[0][1].p_request).toMatchObject({
      tentId,
      observedAt,
      source: "manual",
    });
    expect(view.saved).toHaveBeenCalledWith({ tentId, metricsSaved: 1, createdAt: observedAt });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(mocks.replacement).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
  });
  it.each([
    ["missing", false],
    ["mismatch", false],
    ["lost", false],
    ["missing", true],
    ["mismatch", true],
    ["lost", true],
  ] as const)(
    "keeps %s response unconfirmed with no fallback (page session: %s)",
    async (failure, withSession) => {
      mocks.rpc.mockImplementation(async (_name, { p_request }) => {
        if (failure === "lost") throw new Error("Response lost");
        if (failure === "missing") return { data: null, error: { code: "PGRST202" } };
        return {
          ...receipt(p_request),
          data: { ...receipt(p_request).data, observedAt: "2026-09-17T12:00:00Z" },
        };
      });
      const view = mount(withSession);
      await waitFor(() =>
        expect(view.getByTestId("manual-reading-save-unconfirmed")).toHaveTextContent(
          /correction.*unconfirmed/i,
        ),
      );
      expect(view.saved).not.toHaveBeenCalled();
      expect(view.getByLabelText(/Humidity/i)).toHaveValue(60);
      expect(mocks.replacement).not.toHaveBeenCalled();
      expect(mocks.edit).not.toHaveBeenCalled();
      expect(mocks.batch).not.toHaveBeenCalled();
    },
  );
  it("retries the identical operation after losing the first response", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("Response lost"));
    const view = mount();
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument(),
    );
    const first = structuredClone(mocks.rpc.mock.calls[0][1]);
    fireEvent.click(view.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() => expect(view.saved).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[1][1]).toEqual(first);
  });
  it("does not replace an uncertain operation with later form edits", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("Response lost"));
    const view = mount();
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument(),
    );
    const journalBefore = sessionStorage.getItem(
      "verdant:sensors:pending-correction:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    fireEvent.click(view.getByTestId("manual-sensor-review-back"));
    fireEvent.change(view.getByLabelText(/Humidity/i), { target: { value: "65" } });
    fireEvent.click(view.getByTestId("manual-reading-save"));
    fireEvent.click(view.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument(),
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(
      sessionStorage.getItem(
        "verdant:sensors:pending-correction:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ),
    ).toBe(journalBefore);
    expect(view.saved).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "Restore pending correction" }));
    expect(view.getByLabelText(/Humidity/i)).toHaveValue(60);
    fireEvent.click(view.getByTestId("manual-reading-save"));
    fireEvent.click(view.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() => expect(view.saved).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[1][1]).toEqual(mocks.rpc.mock.calls[0][1]);
  });
  it("does not dispatch when pending storage is corrupt", async () => {
    sessionStorage.setItem(
      "verdant:sensors:pending-correction:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "broken",
    );
    const view = mount();
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument(),
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.replacement).not.toHaveBeenCalled();
    expect(view.saved).not.toHaveBeenCalled();
  });
  it("restores the same correction after a remount without saving automatically", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("Response lost"));
    const first = mount();
    await waitFor(() =>
      expect(first.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument(),
    );
    const request = structuredClone(mocks.rpc.mock.calls[0][1]);
    first.unmount();
    const saved = vi.fn();
    const next = render(
      <MemoryRouter>
        <ManualSensorReadingCard
          tents={[{ id: tentId, name: "Tent A" }]}
          correction={correction}
          onSaved={saved}
        />
      </MemoryRouter>,
    );
    expect(next.getByLabelText(/Humidity/i)).toHaveValue(60);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    fireEvent.click(next.getByTestId("manual-reading-save"));
    fireEvent.click(next.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(mocks.rpc.mock.calls[1][1]).toEqual(request);
  });
  it("does not restore another account's pending edits", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("Response lost"));
    const first = mount();
    await waitFor(() =>
      expect(first.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument(),
    );
    first.unmount();
    mocks.owner = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const next = render(
      <MemoryRouter>
        <ManualSensorReadingCard tents={[{ id: tentId, name: "Tent A" }]} correction={correction} />
      </MemoryRouter>,
    );
    expect(next.getByLabelText(/Humidity/i)).toHaveValue(55);
    expect(next.queryByTestId("manual-reading-save-unconfirmed")).not.toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});

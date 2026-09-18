import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const rpc = vi.fn();
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
import type { ManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
const insertMutate = vi.fn().mockResolvedValue(undefined);
const editMutate = vi.fn().mockResolvedValue({ id: "audit-1", changed_at: "now" });
const returningId = vi.fn();

vi.mock("@/hooks/useInsertSensorReading", () => ({
  useInsertSensorReading: () => ({ mutateAsync: insertMutate, isPending: false }),
  validateSensorReadingPayload: () => {},
}));

vi.mock("@/hooks/useInsertSensorReadings", () => ({
  useInsertSensorReadings: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useInsertManualSnapshotEdit", () => ({
  insertManualSnapshotEdit: (p: unknown) => editMutate(p),
  useInsertManualSnapshotEdit: () => ({ mutateAsync: editMutate, isPending: false }),
}));

vi.mock("@/lib/insertManualSensorReadingReturningId", () => ({
  insertManualSensorReadingReturningId: (p: unknown) => returningId(p),
}));

import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import type { ManualCorrectionContext } from "@/lib/manualSensorCorrectionContext";

const TENT = "11111111-1111-4111-8111-111111111111";
const R_TEMP = "22222222-2222-4222-8222-222222222222";
const R_RH = "33333333-3333-4333-8333-333333333333";
const R_RH_NEXT = "44444444-4444-4444-8444-444444444444";

function makeCtx(overrides?: Partial<ManualCorrectionContext>): ManualCorrectionContext {
  return {
    tentId: TENT,
    originalCapturedAt: "2026-07-01T12:00:00.000Z",
    // 24°C temp, 58% RH — the card converts °C → °F for the airTempF field.
    originalReadingIds: { temperature_c: R_TEMP, humidity_pct: R_RH },
    originalValues: { temperature_c: 24, humidity_pct: 58 },
    ...overrides,
  };
}

function card(correction: ManualCorrectionContext | null) {
  return (
    <MemoryRouter>
      <ManualSensorReadingCard
        tents={[{ id: TENT, name: "Tent A" }]}
        defaultTentId={TENT}
        correction={correction}
      />
    </MemoryRouter>
  );
}

function renderCard(correction: ManualCorrectionContext | null) {
  return render(card(correction));
}

beforeEach(() => {
  sessionStorage.clear();
  rpc
    .mockReset()
    .mockImplementation(
      async (_name, { p_request: request }: { p_request: ManualCorrectionOperation }) => ({
        error: null,
        data: {
          operationId: request.operationId,
          observedAt: request.observedAt,
          changedAt: "2026-09-17T12:00:00Z",
          revision: 1,
          reused: false,
          request,
          changes: request.changes.map((row) => ({
            metric: row.metric,
            readingId: row.originalReadingId ?? R_RH_NEXT,
            previousValue: row.expectedValue,
            value: row.value,
            added: row.originalReadingId === null,
          })),
        },
      }),
    );
  insertMutate.mockReset().mockResolvedValue(undefined);
  editMutate.mockReset().mockResolvedValue({ id: "audit-x", changed_at: "now" });
  returningId
    .mockReset()
    .mockImplementation(async (_p) => ({ id: `new-${Math.random()}`, ts: "now" }));
});

describe("ManualSensorReadingCard — correction mode", () => {
  it("renders the correction banner with the original captured_at", () => {
    const { getByTestId, getByText } = renderCard(makeCtx());
    expect(getByTestId("manual-reading-correction-banner")).toBeInTheDocument();
    expect(getByText(/Correcting manual reading captured at/i)).toBeInTheDocument();
    // Header switches to "Correct Manual Sensor Reading".
    expect(getByText(/Correct Manual Sensor Reading/i)).toBeInTheDocument();
  });

  it("pre-fills form values from the original snapshot (°C → °F for air temp)", () => {
    const { getByLabelText } = renderCard(makeCtx());
    const airTemp = getByLabelText(/Air temp/i) as HTMLInputElement;
    // 24°C = 75.2°F
    expect(Number(airTemp.value)).toBeCloseTo(75.2, 1);
    const rh = getByLabelText(/Humidity/i) as HTMLInputElement;
    expect(Number(rh.value)).toBe(58);
  });

  it("resets the draft when correction identity changes within the same tent", async () => {
    const first = makeCtx();
    const second = makeCtx({
      originalCapturedAt: "2026-07-02T12:00:00.000Z",
      originalReadingIds: { humidity_pct: R_RH_NEXT },
      originalValues: { humidity_pct: 42 },
    });
    const { getByLabelText, getByTestId, queryByTestId, rerender } = renderCard(first);
    const humidity = getByLabelText(/Humidity/i) as HTMLInputElement;

    fireEvent.change(humidity, { target: { value: "99" } });
    expect(humidity.value).toBe("99");

    rerender(card(second));
    await waitFor(() => expect(humidity.value).toBe("42"));

    fireEvent.change(humidity, { target: { value: "43" } });
    fireEvent.click(getByTestId("manual-reading-save"));
    fireEvent.click(getByTestId("manual-sensor-review-confirm"));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls[0][1].p_request.changes[0].originalReadingId).toBe(R_RH_NEXT);

    rerender(card(null));
    await waitFor(() => expect(humidity.value).toBe(""));
    expect(queryByTestId("manual-reading-correction-banner")).not.toBeInTheDocument();
  });

  it("sends only the changed metric in one atomic operation", async () => {
    const view = renderCard(makeCtx());
    fireEvent.change(view.getByLabelText(/Humidity/i), { target: { value: "62" } });
    fireEvent.click(view.getByTestId("manual-reading-save"));
    fireEvent.click(view.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-saved-confirmation")).toBeInTheDocument(),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_request.changes).toEqual([
      { metric: "humidity_pct", originalReadingId: R_RH, expectedValue: 58, value: 62 },
    ]);
    expect(returningId).not.toHaveBeenCalled();
    expect(editMutate).not.toHaveBeenCalled();
    expect(insertMutate).not.toHaveBeenCalled();
  });
  it("submits two changed metrics together with MANUAL source", async () => {
    const view = renderCard(makeCtx());
    fireEvent.change(view.getByLabelText(/Air temp/i), { target: { value: "78" } });
    fireEvent.change(view.getByLabelText(/Humidity/i), { target: { value: "62" } });
    fireEvent.click(view.getByTestId("manual-reading-save"));
    fireEvent.click(view.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-saved-confirmation")).toBeInTheDocument(),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_request.changes).toHaveLength(2);
    expect(rpc.mock.calls[0][1].p_request.source).toBe("manual");
    expect(returningId).not.toHaveBeenCalled();
    expect(editMutate).not.toHaveBeenCalled();
  });
  it("includes an explicitly added metric in the same operation without inventing its original ID", async () => {
    const view = renderCard(
      makeCtx({
        originalReadingIds: { temperature_c: R_TEMP },
        originalValues: { temperature_c: 24 },
      }),
    );
    fireEvent.change(view.getByLabelText(/Humidity/i), { target: { value: "55" } });
    fireEvent.click(view.getByTestId("manual-reading-save"));
    fireEvent.click(view.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-saved-confirmation")).toBeInTheDocument(),
    );
    expect(rpc.mock.calls[0][1].p_request.changes).toEqual([
      { metric: "humidity_pct", originalReadingId: null, expectedValue: null, value: 55 },
    ]);
    expect(insertMutate).not.toHaveBeenCalled();
  });
  it("keeps both edited metrics when the atomic correction is rejected", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    const view = renderCard(makeCtx());
    fireEvent.change(view.getByLabelText(/Air temp/i), { target: { value: "78" } });
    fireEvent.change(view.getByLabelText(/Humidity/i), { target: { value: "62" } });
    fireEvent.click(view.getByTestId("manual-reading-save"));
    fireEvent.click(view.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument(),
    );
    expect(view.getByLabelText(/Humidity/i)).toHaveValue(62);
    expect(view.getByLabelText(/Air temp/i)).toHaveValue(78);
    expect(view.queryByTestId("manual-reading-saved-confirmation")).not.toBeInTheDocument();
    expect(returningId).not.toHaveBeenCalled();
    expect(editMutate).not.toHaveBeenCalled();
  });
});

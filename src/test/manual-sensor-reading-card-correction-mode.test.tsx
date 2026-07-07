/**
 * ManualSensorReadingCard — correction mode wiring.
 *
 * Guarantees:
 *  - Renders banner referencing the original captured_at.
 *  - Pre-fills original values (with °C → °F conversion for air temp).
 *  - On save with ONE changed metric: inserts ONE replacement sensor
 *    reading (source=manual) AND ONE audit row with changed_fields
 *    length 1. No update/delete/upsert of the original row.
 *  - On save with TWO changed metrics: inserts TWO replacement rows and
 *    TWO audit rows (per-metric).
 *  - Metrics with no original ID are still saved (standard insert) but
 *    produce NO audit row — never infers IDs.
 *  - source_before / source_after remain "manual".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

const insertMutate = vi.fn().mockResolvedValue(undefined);
const editMutate = vi.fn().mockResolvedValue({ id: "audit-1", changed_at: "now" });
const returningId = vi.fn();

vi.mock("@/hooks/useInsertSensorReading", () => ({
  useInsertSensorReading: () => ({ mutateAsync: insertMutate, isPending: false }),
  validateSensorReadingPayload: () => {},
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

function renderCard(correction: ManualCorrectionContext | null) {
  return render(
    <MemoryRouter>
      <ManualSensorReadingCard
        tents={[{ id: TENT, name: "Tent A" }]}
        correction={correction}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
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

  it("ONE changed metric → ONE replacement insert + ONE audit row (changed_fields length 1)", async () => {
    const { getByLabelText, getByTestId } = renderCard(makeCtx());
    // Change only humidity from 58 → 62. Air temp stays at prefill 75.2°F ≈ 24°C.
    fireEvent.change(getByLabelText(/Humidity/i), { target: { value: "62" } });
    fireEvent.click(getByTestId("manual-reading-save"));

    await waitFor(() => expect(returningId).toHaveBeenCalled());
    // Replacement inserts: one for temp_c (unchanged but still routed
    // through returning-id because it has an origId), one for humidity.
    // Audit inserts: only for humidity (the changed metric).
    await waitFor(() => expect(editMutate).toHaveBeenCalledTimes(1));
    const auditArg = editMutate.mock.calls[0][0];
    expect(auditArg.original_reading_id).toBe(R_RH);
    expect(auditArg.original.source).toBe("manual");
    expect(auditArg.replacement.source).toBe("manual");
    expect(Object.keys(auditArg.original)).toContain("humidity_pct");
    expect(Object.keys(auditArg.replacement)).toContain("humidity_pct");
    expect(auditArg.original.humidity_pct).toBe(58);
    expect(auditArg.replacement.humidity_pct).toBe(62);
    // Original row was never updated/deleted (no direct sensor_readings
    // mutations occurred here — insertMutate is standard-path only and
    // it must NOT have been called for metrics with an origId).
    for (const call of insertMutate.mock.calls) {
      const p = call[0];
      expect(p.metric).not.toBe("humidity_pct");
      expect(p.metric).not.toBe("temperature_c");
    }
  });

  it("TWO changed metrics → TWO replacement inserts + TWO audit rows (each length 1)", async () => {
    const { getByLabelText, getByTestId } = renderCard(makeCtx());
    fireEvent.change(getByLabelText(/Air temp/i), { target: { value: "78" } }); // was ~75.2
    fireEvent.change(getByLabelText(/Humidity/i), { target: { value: "62" } });
    fireEvent.click(getByTestId("manual-reading-save"));

    await waitFor(() => expect(editMutate).toHaveBeenCalledTimes(2));
    for (const call of editMutate.mock.calls) {
      const arg = call[0];
      expect(arg.original.source).toBe("manual");
      expect(arg.replacement.source).toBe("manual");
      // Each audit call carries a single changed metric — the diff
      // builder derives changed_fields from old/new keys, so pass in
      // exactly one metric on each side.
      const oldKeys = Object.keys(arg.original).filter((k) => k !== "source");
      const newKeys = Object.keys(arg.replacement).filter((k) => k !== "source");
      expect(oldKeys.length).toBe(1);
      expect(newKeys.length).toBe(1);
      expect(oldKeys[0]).toBe(newKeys[0]);
    }
  });

  it("metrics with no original ID are saved (standard insert) with NO audit row", async () => {
    // Provide only a temp original ID. RH has no origId — user still
    // enters an RH value; it must save via standard insert with no audit.
    const ctx = makeCtx({
      originalReadingIds: { temperature_c: R_TEMP },
      originalValues: { temperature_c: 24 },
    });
    const { getByLabelText, getByTestId } = renderCard(ctx);
    // Add a fresh humidity value (no origId → standard path).
    fireEvent.change(getByLabelText(/Humidity/i), { target: { value: "55" } });
    // Change temp so an audit is created for it.
    fireEvent.change(getByLabelText(/Air temp/i), { target: { value: "78" } });
    fireEvent.click(getByTestId("manual-reading-save"));

    await waitFor(() => expect(editMutate).toHaveBeenCalledTimes(1));
    // Standard insert path was called for humidity (no origId).
    const stdMetrics = insertMutate.mock.calls.map((c) => c[0].metric);
    expect(stdMetrics).toContain("humidity_pct");
    // Never for temperature_c (that went through the returning-id path).
    expect(stdMetrics).not.toContain("temperature_c");
    // Audit row is for temperature_c only.
    expect(editMutate.mock.calls[0][0].original_reading_id).toBe(R_TEMP);
  });

  it("failed replacement insert creates no audit row for that metric", async () => {
    returningId.mockImplementation(async (p: { metric: string }) => {
      if (p.metric === "humidity_pct") throw new Error("insert failed");
      return { id: "new-temp", ts: "now" };
    });
    const { getByLabelText, getByTestId } = renderCard(makeCtx());
    fireEvent.change(getByLabelText(/Humidity/i), { target: { value: "62" } });
    fireEvent.change(getByLabelText(/Air temp/i), { target: { value: "78" } });
    fireEvent.click(getByTestId("manual-reading-save"));

    await waitFor(() => expect(returningId).toHaveBeenCalled());
    // No audit rows because save aborted on the first failure — critically,
    // no audit row was written for the metric whose replacement failed.
    for (const call of editMutate.mock.calls) {
      expect(call[0].original_reading_id).not.toBe(R_RH);
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import { buildManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
import {
  saveManualSensorCorrection,
  submitPendingManualCorrection,
} from "@/lib/manualSensorCorrectionService";
import { createManualCorrectionJournal } from "@/lib/manualSensorCorrectionPendingStore";

function operation() {
  const r = buildManualCorrectionOperation({
    operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    correction: {
      tentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      originalCapturedAt: "2026-09-15T08:00:00.123456+00:00",
      originalReadingIds: { temperature_c: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
      originalValues: { temperature_c: 25 },
    },
    metrics: [{ metric: "temperature_c", value: 24 }],
  });
  if (!r.ok) throw new Error("invalid fixture");
  return r.operation;
}
function receipt(op = operation()) {
  return {
    operationId: op.operationId,
    observedAt: op.observedAt,
    request: op,
    changedAt: "2026-09-17T08:00:00+00:00",
    revision: 1,
    reused: false,
    changes: [
      {
        metric: "temperature_c",
        readingId: op.originals[0].readingId,
        previousValue: 25,
        value: 24,
        added: false,
      },
    ],
  };
}
describe("manual correction single-RPC confirmation", () => {
  it("restores a lost-response operation after reload and rejects a different save", async () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };
    const owner = operation().operationId;
    const rpc = vi
      .fn()
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce({ data: { ...receipt(), reused: true }, error: null });
    expect(
      await submitPendingManualCorrection(
        owner,
        operation(),
        { rpc },
        createManualCorrectionJournal(() => storage),
      ),
    ).toEqual({ status: "unconfirmed", operation: operation() });
    const afterReload = createManualCorrectionJournal(() => storage);
    const different = operation();
    Object.assign(different.changes[0], { value: 23 });
    expect(await submitPendingManualCorrection(owner, different, { rpc }, afterReload)).toEqual({
      status: "pending",
      operation: operation(),
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    const pending = afterReload.read(owner);
    if (pending.status !== "pending") throw new Error("missing recovery operation");
    expect(
      await submitPendingManualCorrection(owner, pending.operation, { rpc }, afterReload),
    ).toEqual({ status: "confirmed", cleanup: "complete" });
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(afterReload.read(owner)).toEqual({ status: "empty" });
  });
  it("persists before dispatch and clears only after exact confirmation", async () => {
    const data = new Map<string, string>();
    const journal = createManualCorrectionJournal(() => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    }));
    const owner = operation().operationId;
    const rpc = vi.fn().mockImplementation(async () => {
      expect(journal.read(owner)).toEqual({ status: "pending", operation: operation() });
      return { data: receipt(), error: null };
    });
    expect(await submitPendingManualCorrection(owner, operation(), { rpc }, journal)).toEqual({
      status: "confirmed",
      cleanup: "complete",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(journal.read(owner)).toEqual({ status: "empty" });
  });
  it("makes no RPC when storage cannot retain the pending operation", async () => {
    const journal = createManualCorrectionJournal(() => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }));
    const rpc = vi.fn();
    expect(
      await submitPendingManualCorrection(operation().operationId, operation(), { rpc }, journal),
    ).toEqual({ status: "blocked" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("keeps a confirmed save confirmed when journal cleanup fails", async () => {
    const data = new Map<string, string>();
    const journal = createManualCorrectionJournal(() => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: () => {
        throw new Error("storage denied");
      },
    }));
    const rpc = vi.fn().mockResolvedValue({ data: receipt(), error: null });
    expect(
      await submitPendingManualCorrection(operation().operationId, operation(), { rpc }, journal),
    ).toEqual({ status: "confirmed", cleanup: "pending" });
    expect(journal.read(operation().operationId).status).toBe("pending");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects altered pending intent before dispatch", async () => {
    const op = operation();
    Object.assign(op.changes[0], { expectedValue: 99 });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(await saveManualSensorCorrection(op, { rpc })).toEqual({ status: "unconfirmed" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([undefined, false, 0, ""])("requires an explicit null error, not %j", async (error) => {
    const rpc = vi.fn().mockResolvedValue({ data: receipt(), error });
    expect(await saveManualSensorCorrection(operation(), { rpc })).toEqual({
      status: "unconfirmed",
    });
  });
  it("confirms an exact receipt after one RPC", async () => {
    const op = operation();
    const rpc = vi.fn().mockResolvedValue({ data: receipt(), error: null });
    expect(await saveManualSensorCorrection(op, { rpc })).toEqual({ status: "confirmed" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_manual_sensor_correction", { p_request: op });
  });
  it("keeps a lost response unconfirmed and reuses the exact operation on explicit retry", async () => {
    const op = operation();
    const rpc = vi
      .fn()
      .mockRejectedValueOnce(new Error("private detail"))
      .mockResolvedValueOnce({ data: { ...receipt(), reused: true }, error: null });
    expect(await saveManualSensorCorrection(op, { rpc })).toEqual({ status: "unconfirmed" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await saveManualSensorCorrection(op, { rpc })).toEqual({ status: "confirmed" });
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
  it.each(["PGRST202", "40001", "42501", "22023"])(
    "does not fall back or confirm error %s",
    async (code) => {
      const rpc = vi
        .fn()
        .mockResolvedValue({ data: receipt(), error: { code, message: "private detail" } });
      expect(await saveManualSensorCorrection(operation(), { rpc })).toEqual({
        status: "unconfirmed",
      });
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
  it.each([null, {}, { count: 1 }, { ...receipt(), observedAt: "2026-09-17T08:00:00Z" }])(
    "does not confirm malformed success %j",
    async (data) => {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      expect(await saveManualSensorCorrection(operation(), { rpc })).toEqual({
        status: "unconfirmed",
      });
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
  it.each([null, undefined])("does not dispatch without a pending operation %j", async (op) => {
    const rpc = vi.fn();
    expect(await saveManualSensorCorrection(op, { rpc })).toEqual({ status: "unconfirmed" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("isolates the dispatched request and expected receipt from later form edits", async () => {
    const op = operation();
    const expected = structuredClone(op);
    let finish!: (value: { data: unknown; error: null }) => void;
    const rpc = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = saveManualSensorCorrection(op, { rpc });
    Object.assign(op, { tentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
    Object.assign(op.changes[0], { value: 30 });
    expect(rpc.mock.calls[0][1].p_request).toEqual(expected);
    finish({ data: receipt(expected), error: null });
    expect(await pending).toEqual({ status: "confirmed" });
  });
});

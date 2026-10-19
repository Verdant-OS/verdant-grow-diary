/**
 * #2114 P1: a pH-only or EC-only Plant Quick Log writes a diary snapshot but
 * no environment grow_event, so the tent's "Recent manual snapshots" history
 * must read diary snapshots too. Diary `ec` is reservoir EC (mS/cm), never
 * soil EC. A sensor-bearing save (diary mirror + environment sibling) shows
 * once.
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildTentManualHistoryRead,
  type TentHistorySourceRead,
  type TentManualEnvironmentEvent,
  type TentManualMirrorDiaryRow,
} from "@/lib/tentManualEnvironmentEventRules";
import { buildManualSnapshotHistoryList } from "@/lib/manualSensorSnapshotHistoryListRules";

type DiaryRow = TentManualMirrorDiaryRow & { id: string };

const TENT = "tent-1";
const PLANT = "plant-1";

function read<T>(
  data: T[] | undefined,
  status: "pending" | "error" | "success" = "success",
) {
  const refetch = vi.fn<() => unknown>();
  return { status, isFetching: false, data, refetch } satisfies TentHistorySourceRead<T>;
}

function diaryRow(id: string, entryAt: string, snapshot: Record<string, unknown>, extra = {}) {
  return {
    id,
    tent_id: TENT,
    plant_id: PLANT,
    entry_at: entryAt,
    details: { manual_sensor_snapshot: { source: "manual", ...snapshot }, ...extra },
  } satisfies DiaryRow;
}

function history(diary: DiaryRow[], events: TentManualEnvironmentEvent[] = []) {
  const view = buildTentManualHistoryRead({
    sensor: read<never>([]),
    manual: read(events),
    diary: read(diary),
  });
  return buildManualSnapshotHistoryList(view.readings, { tentId: TENT, limit: 5 });
}

describe("tent manual history includes diary-only snapshots", () => {
  it("shows a pH-only Plant Quick Log exactly once", () => {
    const entries = history([diaryRow("d-ph", "2026-10-19T10:00:00.000Z", { ph: 6.2 })]);
    expect(entries).toHaveLength(1);
    expect(entries[0].metrics).toEqual([{ key: "reservoir_ph", label: "pH", formatted: "6.20" }]);
  });

  it("shows an EC-only Plant Quick Log once as Reservoir EC, never Soil EC", () => {
    const entries = history([diaryRow("d-ec", "2026-10-19T10:00:00.000Z", { ec: 1.4 })]);
    expect(entries).toHaveLength(1);
    expect(entries[0].metrics).toEqual([
      { key: "reservoir_ec_ms_cm", label: "Reservoir EC", formatted: "1.40 mS/cm" },
    ]);
    expect(JSON.stringify(entries)).not.toContain("Soil EC");
  });

  it("flags an implausible reservoir EC instead of showing it as a reading", () => {
    const entries = history([diaryRow("d-bad", "2026-10-19T10:00:00.000Z", { ec: 1400 })]);
    expect(entries).toHaveLength(1);
    expect(entries[0].metrics).toEqual([]);
    expect(entries[0].invalidChips.map((c) => c.key)).toEqual(["reservoir_ec_ms_cm"]);
  });

  it("shows a sensor-bearing save once: the diary mirror, not its environment sibling", () => {
    const at = "2026-10-19T10:00:00.000Z";
    const mirror = diaryRow(
      "d-mirror",
      at,
      { temp_f: 77, humidity_percent: 55, ph: 6.1, ec: 1.2 },
      { linked_grow_event_id: "parent-action" },
    );
    const sibling: TentManualEnvironmentEvent = {
      id: "env-sibling",
      tentId: TENT,
      plantId: PLANT,
      occurredAt: at,
      temperatureC: 25,
      humidityPct: 55,
      vpdKpa: null,
    };
    const entries = history([mirror], [sibling]);
    expect(entries).toHaveLength(1);
    expect(entries[0].metrics.map((m) => m.key)).toEqual([
      "temperature_c",
      "humidity_pct",
      "reservoir_ph",
      "reservoir_ec_ms_cm",
    ]);
  });

  it("ignores diary rows without a manual snapshot or on another tent", () => {
    const other = { ...diaryRow("d-other", "2026-10-19T10:00:00.000Z", { ph: 6 }), tent_id: "x" };
    const plain = {
      id: "d-plain",
      tent_id: TENT,
      plant_id: PLANT,
      entry_at: "2026-10-19T11:00:00.000Z",
      details: { note: "watered" },
    };
    expect(history([other, plain])).toEqual([]);
  });
});

describe("tent manual history read state covers the diary read", () => {
  it("is an error when the diary read fails", () => {
    const view = buildTentManualHistoryRead({
      sensor: read<never>([]),
      manual: read<TentManualEnvironmentEvent>([]),
      diary: read<DiaryRow>(undefined, "error"),
    });
    expect(view.readStatus).toBe("error");
  });

  it("is pending while the diary read is pending", () => {
    const view = buildTentManualHistoryRead({
      sensor: read<never>([]),
      manual: read<TentManualEnvironmentEvent>([]),
      diary: read<DiaryRow>(undefined, "pending"),
    });
    expect(view.readStatus).toBe("pending");
  });

  it("retries the diary read with the others", () => {
    const sensor = read<never>([]);
    const manual = read<TentManualEnvironmentEvent>([]);
    const diary = read<DiaryRow>(undefined, "error");
    buildTentManualHistoryRead({ sensor, manual, diary }).onRetry();
    expect(sensor.refetch).toHaveBeenCalledTimes(1);
    expect(manual.refetch).toHaveBeenCalledTimes(1);
    expect(diary.refetch).toHaveBeenCalledTimes(1);
  });
});

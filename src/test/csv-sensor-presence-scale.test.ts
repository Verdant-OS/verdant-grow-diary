import { describe, expect, it } from "vitest";
import {
  collectCandidateCsvSensorPresenceKeys,
  collectCsvSensorPresenceKeys,
} from "@/lib/csvSensorPresenceService";
import { dedupeKeyOf, type DedupeKeyParts } from "@/lib/csv-import/sensorReadingsBatchInsert";

const start = Date.parse("2026-01-01T00:00:00Z");
const timestamp = (index: number) => new Date(start + index * 60_000).toISOString();
const timestamps = Array.from({ length: 50_000 }, (_, index) => timestamp(index));
const row = (captured_at: string): DedupeKeyParts => ({
  tent_id: "tent-a",
  source: "csv",
  metric: "temperature_c",
  captured_at,
});

describe("CSV presence lookup scale", () => {
  it.each([true, false])(
    "retains all six metrics across server-capped pages with count available=%s",
    async (countAvailable) => {
      const metrics = [
        "temperature_c",
        "humidity_pct",
        "vpd_kpa",
        "soil_moisture_pct",
        "co2_ppm",
        "ppfd",
      ];
      let calls = 0;
      const keys = await collectCandidateCsvSensorPresenceKeys(
        timestamps,
        async (batch, from) => {
          calls += 1;
          const rows = batch.flatMap((captured_at) =>
            metrics.map((metric) => ({ ...row(captured_at), metric })),
          );
          return {
            rows: rows.slice(from, from + 125),
            totalCount: countAvailable ? rows.length : null,
          };
        },
        () => true,
      );
      expect(keys.size).toBe(300_000);
      for (const metric of metrics) {
        expect(keys.has(dedupeKeyOf({ ...row(timestamp(49_999)), metric })!)).toBe(true);
      }
      expect(calls).toBeLessThanOrEqual(countAvailable ? 2500 : 3000);
    },
  );

  it("stops at an exact server count without requesting an empty terminator for each batch", async () => {
    let calls = 0;
    const keys = await collectCandidateCsvSensorPresenceKeys(
      timestamps,
      async (batch, from) => {
        calls += 1;
        return { rows: batch.slice(from, from + 125).map(row), totalCount: batch.length };
      },
      () => true,
    );
    expect(keys.size).toBe(50_000);
    expect(calls).toBeLessThanOrEqual(500);
  });

  it("continues through capped nonfinal pages until every counted row is retained", async () => {
    const rows = timestamps.slice(0, 5).map(row);
    const offsets: number[] = [];
    const keys = await collectCsvSensorPresenceKeys(
      async (from) => {
        offsets.push(from);
        return { rows: rows.slice(from, from + 2), totalCount: 5 };
      },
      () => true,
    );
    expect(keys.size).toBe(5);
    expect(offsets).toEqual([0, 2, 4]);
  });

  it.each([-1, 1.5, Number.NaN])(
    "rejects invalid count %s instead of treating a partial page as complete",
    async (totalCount) => {
      await expect(
        collectCsvSensorPresenceKeys(
          async () => ({ rows: [], totalCount }),
          () => true,
        ),
      ).rejects.toThrow("Invalid CSV presence count");
    },
  );

  it("rejects an empty page when its exact count still promises missing rows", async () => {
    await expect(
      collectCsvSensorPresenceKeys(
        async () => ({ rows: [], totalCount: 2 }),
        () => true,
      ),
    ).rejects.toThrow("CSV presence count did not match page");
  });

  it("falls back to empty-page termination when the count header is unavailable", async () => {
    const offsets: number[] = [];
    const rows = timestamps.slice(0, 3).map(row);
    const keys = await collectCsvSensorPresenceKeys(
      async (from) => {
        offsets.push(from);
        return { rows: rows.slice(from, from + 2), totalCount: null };
      },
      () => true,
    );
    expect(keys.size).toBe(3);
    expect(offsets).toEqual([0, 2, 3]);
  });

  it("drains other in-flight reads before propagating an error and starts no later batch", async () => {
    const failure = new Error("presence read failed");
    let failFirst!: (error: Error) => void;
    let releaseOthers!: () => void;
    const failedRead = new Promise<never>((_resolve, reject) => {
      failFirst = reject;
    });
    const otherReads = new Promise<void>((resolve) => {
      releaseOthers = resolve;
    });
    let calls = 0;
    let settled = false;
    const lookup = collectCandidateCsvSensorPresenceKeys(
      timestamps.slice(0, 800),
      async (batch) => {
        calls += 1;
        if (batch[0] === timestamps[0]) return failedRead;
        await otherReads;
        return [];
      },
      () => true,
    ).catch((error: unknown) => {
      settled = true;
      return error;
    });
    await Promise.resolve();
    failFirst(failure);
    await Promise.resolve();
    await Promise.resolve();
    const settledBeforeDrain = settled;
    releaseOthers();
    expect(await lookup).toBe(failure);
    expect(settledBeforeDrain).toBe(false);
    expect(calls).toBe(4);
  });

  it("merges completed batches in canonical input order even when replies arrive in reverse order", async () => {
    const input = timestamps.slice(0, 400);
    const release: Array<() => void> = [];
    const lookup = collectCandidateCsvSensorPresenceKeys(
      [...input].reverse(),
      async (batch, from) => {
        if (from > 0) return [];
        await new Promise<void>((resolve) => {
          release.push(resolve);
        });
        return batch.map(row);
      },
      () => true,
    );
    await Promise.resolve();
    for (const resolve of [...release].reverse()) {
      resolve();
      await Promise.resolve();
    }
    expect([...(await lookup)]).toEqual(input.map((value) => dedupeKeyOf(row(value))!));
  });

  it("does not make thousands of requests for an empty 50000-timestamp import", async () => {
    let calls = 0;
    const keys = await collectCandidateCsvSensorPresenceKeys(
      timestamps,
      async () => {
        calls += 1;
        return [];
      },
      () => true,
    );
    expect(keys.size).toBe(0);
    expect(calls).toBeLessThanOrEqual(500);
  });

  it("retains every matching key with bounded work when the server caps pages below requested size", async () => {
    let calls = 0;
    const keys = await collectCandidateCsvSensorPresenceKeys(
      timestamps,
      async (batch, from) => {
        calls += 1;
        return batch.slice(from, from + 75).map(row);
      },
      () => true,
    );
    expect(keys.size).toBe(50_000);
    expect(keys.has(dedupeKeyOf(row(timestamp(0)))!)).toBe(true);
    expect(keys.has(dedupeKeyOf(row(timestamp(49_999)))!)).toBe(true);
    expect(calls).toBeLessThanOrEqual(1500);
  });

  it("overlaps a bounded number of independent reads instead of serializing the whole import", async () => {
    let active = 0;
    let maximum = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lookup = collectCandidateCsvSensorPresenceKeys(
      timestamps.slice(0, 800),
      async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await gate;
        active -= 1;
        return [];
      },
      () => true,
    );
    await Promise.resolve();
    const waiting = active;
    release();
    expect(await lookup).toEqual(new Set());
    expect(waiting).toBe(4);
    expect(maximum).toBe(4);
    expect(active).toBe(0);
  });

  it("does not start another page or expose partial keys after ownership changes during parallel reads", async () => {
    let active = true;
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lookup = collectCandidateCsvSensorPresenceKeys(
      timestamps.slice(0, 800),
      async (batch) => {
        calls += 1;
        await gate;
        return batch.map(row);
      },
      () => active,
    );
    await Promise.resolve();
    const started = calls;
    active = false;
    release();
    expect(await lookup).toEqual(new Set());
    expect(calls).toBe(started);
    expect(calls).toBeLessThanOrEqual(4);
  });
});

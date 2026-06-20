import { describe, it, expect } from "vitest";
import {
  buildQuickLogSensorSnapshotViewModel,
  isQuickLogSnapshotAttachable,
} from "@/lib/quickLogSensorSnapshotViewModel";

const NOW = new Date("2026-06-19T12:00:00.000Z").getTime();
const opts = { now: NOW };
const iso = (deltaMs: number) => new Date(NOW - deltaMs).toISOString();

describe("buildQuickLogSensorSnapshotViewModel", () => {
  it("returns empty preview + non-attachable when no snapshot input", () => {
    const vm = buildQuickLogSensorSnapshotViewModel(null, opts);
    expect(vm.display).toBeNull();
    expect(vm.emptyCopy).toMatch(/no sensor snapshot/i);
    expect(vm.isAttachable).toBe(false);
    expect(vm.attachment).toBeNull();
    expect(isQuickLogSnapshotAttachable(vm)).toBe(false);
  });

  it("labels fresh live snapshots as attachable with safe metrics", () => {
    const vm = buildQuickLogSensorSnapshotViewModel(
      {
        tentId: "tent-uuid-1",
        plantId: "plant-uuid-2",
        snapshot: {
          source: "live",
          capturedAt: iso(60_000),
          confidence: 0.9,
          sourceDetail: "ggs_controller",
          metrics: [
            { key: "temp", value: 24.3, unit: "°C" },
            { key: "rh", value: 55, unit: "%" },
          ],
        },
      },
      opts,
    );
    expect(vm.isAttachable).toBe(true);
    expect(vm.attachment).not.toBeNull();
    expect(vm.attachment!.source).toBe("live");
    expect(vm.attachment!.tent_id).toBe("tent-uuid-1");
    expect(vm.attachment!.plant_id).toBe("plant-uuid-2");
    expect(vm.attachment!.metrics).toHaveLength(2);
    expect(vm.warning).toBeNull();
  });

  it("labels manual snapshots distinctly and still attachable", () => {
    const vm = buildQuickLogSensorSnapshotViewModel(
      { snapshot: { source: "manual", capturedAt: iso(60_000) } },
      opts,
    );
    expect(vm.display?.effectiveSource).toBe("manual");
    expect(vm.isAttachable).toBe(true);
  });

  it("does not attach demo data, even with current timestamp", () => {
    const vm = buildQuickLogSensorSnapshotViewModel(
      { snapshot: { source: "demo", capturedAt: iso(0) } },
      opts,
    );
    expect(vm.display?.effectiveSource).toBe("demo");
    expect(vm.isAttachable).toBe(false);
    expect(vm.attachment).toBeNull();
    expect(vm.warning).toMatch(/demo/i);
  });

  it("does not attach stale readings and surfaces stale warning copy", () => {
    const vm = buildQuickLogSensorSnapshotViewModel(
      {
        snapshot: {
          source: "live",
          capturedAt: iso(60 * 60 * 1000),
          metrics: [{ key: "temp", value: 22 }],
        },
      },
      opts,
    );
    expect(vm.display?.freshness).toBe("stale");
    expect(vm.isAttachable).toBe(false);
    expect(vm.warning).toMatch(/stale/i);
  });

  it("does not attach invalid readings (missing captured_at)", () => {
    const vm = buildQuickLogSensorSnapshotViewModel(
      { snapshot: { source: "live" } },
      opts,
    );
    expect(vm.display?.effectiveSource).toBe("invalid");
    expect(vm.isAttachable).toBe(false);
    expect(vm.warning).toMatch(/invalid|missing/i);
  });

  it("does not attach future-timestamped readings", () => {
    const vm = buildQuickLogSensorSnapshotViewModel(
      {
        snapshot: {
          source: "live",
          capturedAt: new Date(NOW + 60_000).toISOString(),
        },
      },
      opts,
    );
    expect(vm.display?.effectiveSource).toBe("invalid");
    expect(vm.isAttachable).toBe(false);
  });

  it("never attaches unknown sources", () => {
    const vm = buildQuickLogSensorSnapshotViewModel(
      { snapshot: { source: "mystery", capturedAt: iso(0) } },
      opts,
    );
    expect(vm.display?.effectiveSource).toBe("invalid");
    expect(vm.isAttachable).toBe(false);
  });

  it("rejects unsafe tent/plant id shapes", () => {
    const vm = buildQuickLogSensorSnapshotViewModel(
      {
        tentId: "evil id; drop table",
        plantId: " ",
        snapshot: { source: "live", capturedAt: iso(0) },
      },
      opts,
    );
    expect(vm.attachment!.tent_id).toBeNull();
    expect(vm.attachment!.plant_id).toBeNull();
  });

  it("attachment payload never contains raw_payload or secret-like fields", () => {
    const vm = buildQuickLogSensorSnapshotViewModel(
      {
        snapshot: {
          source: "live",
          capturedAt: iso(0),
          // Defensive: extra unknown keys must not leak through.
          ...({
            raw_payload: { api_key: "abcd", secret: "x" },
            bridge_token: "t",
            mac: "AA:BB",
          } as Record<string, unknown>),
        },
      },
      opts,
    );
    const json = JSON.stringify(vm);
    expect(json).not.toMatch(/raw_payload/);
    expect(json).not.toMatch(/api_key/);
    expect(json).not.toMatch(/bridge_token/);
    expect(json).not.toMatch(/AA:BB/);
    expect(json).not.toMatch(/secret/);
  });

  it("save is never blocked: every non-attachable case still yields a preview model or empty copy", () => {
    const cases = [
      null,
      { snapshot: null },
      { snapshot: { source: "live" } },
      { snapshot: { source: "demo", capturedAt: iso(0) } },
      {
        snapshot: {
          source: "live",
          capturedAt: iso(60 * 60 * 1000),
          metrics: [{ key: "temp" as const, value: 21 }],
        },
      },
    ];
    for (const c of cases) {
      const vm = buildQuickLogSensorSnapshotViewModel(c as never, opts);
      // Either we have a preview model or a non-empty empty-copy fallback.
      expect(vm.display !== null || (vm.emptyCopy ?? "").length > 0).toBe(true);
      // Non-attachable cases never produce an attachment payload.
      if (!vm.isAttachable) expect(vm.attachment).toBeNull();
    }
  });
});

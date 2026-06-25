import { describe, it, expect } from "vitest";
import {
  buildAuditReport,
  deriveSafeDeviceDisplayId,
} from "@/lib/sensorIngestAuditReportRules";

describe("sensorIngestAuditReportRules — filters + safe device display id", () => {
  const baseRow = (i: number, opts: Partial<{ provider: string; capturedAt: string; payload: Record<string, unknown> }>) => ({
    id: `r${i}`,
    tent_id: "t",
    captured_at: opts.capturedAt ?? `2026-06-19T12:0${i}:00Z`,
    metric: "temp_c",
    value: 22,
    source: "live",
    raw_payload: {
      provider: opts.provider ?? "ecowitt",
      transport: "mqtt",
      ...opts.payload,
    },
  });

  it("derives a safe display id from device_name", () => {
    expect(
      deriveSafeDeviceDisplayId({ device_name: "Greenhouse A" }),
    ).toBe("Greenhouse A");
  });

  it("rejects MAC-shaped candidates", () => {
    expect(
      deriveSafeDeviceDisplayId({ device_name: "AA:BB:CC:DD:EE:FF" }),
    ).toBeNull();
  });

  it("rejects IP-shaped candidates", () => {
    expect(
      deriveSafeDeviceDisplayId({ station_name: "192.168.1.42" }),
    ).toBeNull();
  });

  it("rejects passkey-like values", () => {
    expect(
      deriveSafeDeviceDisplayId({ display_id: "passkey-XYZ" }),
    ).toBeNull();
  });

  it("provider filter narrows rows locally", () => {
    const r = buildAuditReport({
      rows: [
        baseRow(1, { provider: "ecowitt" }),
        baseRow(2, { provider: "home_assistant" }),
        baseRow(3, { provider: "ecowitt" }),
      ],
      filters: { provider: "ecowitt" },
    });
    expect(r.rows).toHaveLength(2);
    expect(r.availableProviders).toEqual(
      expect.arrayContaining(["ecowitt", "home_assistant"]),
    );
    expect(r.filteredTotal).toBe(2);
  });

  it("captured_at range filter narrows rows", () => {
    const r = buildAuditReport({
      rows: [
        baseRow(1, { capturedAt: "2026-06-19T10:00:00Z" }),
        baseRow(2, { capturedAt: "2026-06-19T12:00:00Z" }),
        baseRow(3, { capturedAt: "2026-06-19T14:00:00Z" }),
      ],
      filters: {
        capturedFromIso: "2026-06-19T11:00:00Z",
        capturedToIso: "2026-06-19T13:00:00Z",
      },
    });
    expect(r.rows.map((x) => x.id)).toEqual(["r2"]);
  });

  it("device search matches safe display id only", () => {
    const r = buildAuditReport({
      rows: [
        baseRow(1, { payload: { device_name: "Greenhouse A" } }),
        baseRow(2, { payload: { device_name: "Greenhouse B" } }),
        baseRow(3, { payload: { passkey: "S3CRET", device_name: "AA:BB:CC:DD:EE:FF" } }),
      ],
      filters: { deviceStationQuery: "greenhouse a" },
    });
    expect(r.rows.map((x) => x.id)).toEqual(["r1"]);
  });

  it("does not surface MAC/passkey in audit row data", () => {
    const r = buildAuditReport({
      rows: [
        baseRow(1, {
          payload: {
            device_name: "AA:BB:CC:DD:EE:FF",
            passkey: "SECRET",
          },
        }),
      ],
    });
    expect(r.rows[0].deviceStationDisplayId).toBeNull();
  });

  it("ecowitt as canonical source is never accepted", () => {
    const r = buildAuditReport({
      rows: [
        {
          id: "r1",
          tent_id: "t",
          captured_at: "2026-06-19T12:00:00Z",
          source: "ecowitt",
          raw_payload: { provider: "ecowitt" },
        },
      ],
    });
    expect(r.rows[0].source).toBe("unknown");
  });

  it("rejected-not-persisted note is always present", () => {
    const r = buildAuditReport({ rows: [] });
    expect(r.note).toMatch(/Rejected/);
  });
});

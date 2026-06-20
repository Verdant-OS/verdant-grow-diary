import { describe, it, expect } from "vitest";
import { buildAuditReport, redactPayload, REJECTED_NOT_PERSISTED_NOTE } from "@/lib/sensorIngestAuditReportRules";

describe("sensorIngestAuditReportRules", () => {
  it("returns last N accepted readings sorted by captured_at desc", () => {
    const r = buildAuditReport({
      rows: [
        { id: "a", tent_id: "t", captured_at: "2026-06-19T10:00:00Z", metric: "temp_c", value: 22, source: "live", raw_payload: { provider: "ecowitt", transport: "mqtt", metrics: { vpd_kpa: 1.1 } } },
        { id: "b", tent_id: "t", captured_at: "2026-06-19T11:00:00Z", metric: "temp_c", value: 23, source: "live", raw_payload: { provider: "ecowitt", transport: "mqtt" } },
        { id: "c", tent_id: "t", captured_at: "2026-06-19T09:00:00Z", metric: "temp_c", value: 21, source: "live", raw_payload: { provider: "ecowitt", transport: "mqtt" } },
      ],
      pageSize: 10,
      now: new Date("2026-06-19T11:01:00Z"),
    });
    expect(r.rows.map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(r.rows.every((x) => x.accepted)).toBe(true);
    expect(r.note).toBe(REJECTED_NOT_PERSISTED_NOTE);
  });

  it("never reports source=ecowitt — that is a provider, not a canonical source", () => {
    const r = buildAuditReport({
      rows: [
        { id: "x", tent_id: "t", captured_at: "2026-06-19T10:00:00Z", source: "ecowitt", raw_payload: { provider: "ecowitt" } },
      ],
    });
    expect(r.rows[0].source).toBe("unknown");
    expect(r.rows[0].provider).toBe("ecowitt");
  });

  it("missing VPD stays null — never 0", () => {
    const r = buildAuditReport({
      rows: [
        { id: "z", tent_id: "t", captured_at: "2026-06-19T10:00:00Z", source: "live", raw_payload: { metrics: { vpd_kpa: 0 } } },
      ],
    });
    expect(r.rows[0].vpdKpa).toBeNull();
  });

  it("redacts secret-shaped keys in raw_payload preview", () => {
    const out = redactPayload({
      PASSKEY: "ABC123SECRETKEY",
      mac: "AA:BB:CC:DD:EE:FF",
      metrics: { temp_c: 22 },
      bearer_token: "tok_xxx",
    });
    expect(out).not.toContain("ABC123SECRETKEY");
    expect(out).not.toContain("AA:BB:CC:DD:EE:FF");
    expect(out).toContain("[redacted]");
  });

  it("classifies freshness using captured_at and stale window", () => {
    const r = buildAuditReport({
      rows: [
        { id: "fresh", tent_id: "t", captured_at: "2026-06-19T11:59:30Z", source: "live", raw_payload: {} },
        { id: "stale", tent_id: "t", captured_at: "2026-06-19T08:00:00Z", source: "live", raw_payload: {} },
      ],
      now: new Date("2026-06-19T12:00:00Z"),
    });
    expect(r.rows.find((x) => x.id === "fresh")?.freshness).toBe("fresh");
    expect(r.rows.find((x) => x.id === "stale")?.freshness).toBe("stale");
  });
});

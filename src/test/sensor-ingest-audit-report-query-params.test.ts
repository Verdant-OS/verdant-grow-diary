import { describe, it, expect } from "vitest";
import {
  parseAuditUrlState,
  serializeAuditUrlState,
  applyAuditUrlState,
  isSafeDeviceQuery,
  AUDIT_URL_DEFAULT_STATE,
  AUDIT_URL_PARAM_DEVICE,
  AUDIT_URL_PARAM_PROVIDER,
  AUDIT_URL_PARAM_PAGE_SIZE,
} from "@/lib/sensorIngestAuditReportQueryParams";

describe("parseAuditUrlState", () => {
  it("falls back to safe defaults for empty params", () => {
    const out = parseAuditUrlState(new URLSearchParams());
    expect(out).toEqual(AUDIT_URL_DEFAULT_STATE);
    expect(out.provider).toBe("all");
    expect(out.pageSize).toBe(25);
  });

  it("falls back to default for an invalid last-N", () => {
    const out = parseAuditUrlState(
      new URLSearchParams({ audit_n: "999" }),
    );
    expect(out.pageSize).toBe(25);
  });

  it("falls back to 'all' for unsafe provider strings", () => {
    const out = parseAuditUrlState(
      new URLSearchParams({ audit_provider: "Bearer abc1234567" }),
    );
    expect(out.provider).toBe("all");
  });

  it("drops unsafe device queries", () => {
    const out = parseAuditUrlState(
      new URLSearchParams({ audit_q: "AA:BB:CC:DD:EE:FF" }),
    );
    expect(out.deviceQuery).toBe("");
  });

  it("drops invalid dates", () => {
    const out = parseAuditUrlState(
      new URLSearchParams({ audit_from: "not-a-date", audit_to: "" }),
    );
    expect(out.fromDateInput).toBe("");
    expect(out.toDateInput).toBe("");
  });

  it("accepts valid values", () => {
    const out = parseAuditUrlState(
      new URLSearchParams({
        audit_provider: "ecowitt",
        audit_from: "2026-06-01T00:00",
        audit_to: "2026-06-19T23:59",
        audit_q: "Greenhouse A",
        audit_n: "50",
      }),
    );
    expect(out).toEqual({
      provider: "ecowitt",
      fromDateInput: "2026-06-01T00:00",
      toDateInput: "2026-06-19T23:59",
      deviceQuery: "Greenhouse A",
      pageSize: 50,
    });
  });
});

describe("serializeAuditUrlState", () => {
  it("omits defaults", () => {
    expect(serializeAuditUrlState(AUDIT_URL_DEFAULT_STATE)).toEqual({});
  });

  it("emits sanitized provider + sizes", () => {
    expect(
      serializeAuditUrlState({
        provider: "ECOWITT",
        fromDateInput: "",
        toDateInput: "",
        deviceQuery: "",
        pageSize: 50,
      }),
    ).toEqual({ audit_provider: "ecowitt", audit_n: "50" });
  });

  it("drops unsafe device query when serializing", () => {
    expect(
      serializeAuditUrlState({
        ...AUDIT_URL_DEFAULT_STATE,
        deviceQuery: "AA:BB:CC:DD:EE:FF",
      }),
    ).toEqual({});
  });
});

describe("applyAuditUrlState", () => {
  it("preserves operator=1 and other unrelated params", () => {
    const current = new URLSearchParams({ operator: "1", tab: "x" });
    const next = applyAuditUrlState(current, {
      ...AUDIT_URL_DEFAULT_STATE,
      provider: "ecowitt",
      pageSize: 10,
    });
    expect(next.get("operator")).toBe("1");
    expect(next.get("tab")).toBe("x");
    expect(next.get(AUDIT_URL_PARAM_PROVIDER)).toBe("ecowitt");
    expect(next.get(AUDIT_URL_PARAM_PAGE_SIZE)).toBe("10");
  });

  it("removes prior audit params that are no longer present", () => {
    const current = new URLSearchParams({
      operator: "1",
      audit_provider: "ecowitt",
      audit_n: "50",
    });
    const next = applyAuditUrlState(current, AUDIT_URL_DEFAULT_STATE);
    expect(next.get(AUDIT_URL_PARAM_PROVIDER)).toBeNull();
    expect(next.get(AUDIT_URL_PARAM_PAGE_SIZE)).toBeNull();
    expect(next.get("operator")).toBe("1");
  });

  it("never persists an unsafe device query", () => {
    const next = applyAuditUrlState(new URLSearchParams({ operator: "1" }), {
      ...AUDIT_URL_DEFAULT_STATE,
      deviceQuery: "Bearer abcdef0123456789",
    });
    expect(next.get(AUDIT_URL_PARAM_DEVICE)).toBeNull();
  });
});

describe("isSafeDeviceQuery", () => {
  it("rejects MAC / IP / JWT / Bearer / passkey / token / api_key shapes", () => {
    for (const v of [
      "AA:BB:CC:DD:EE:FF",
      "192.168.0.10",
      "Bearer abcdef0123456",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signaturepart",
      "my passkey",
      "auth token here",
      "api_key=foo",
    ]) {
      expect(isSafeDeviceQuery(v)).toBe(false);
    }
  });

  it("accepts safe display labels", () => {
    expect(isSafeDeviceQuery("Greenhouse A")).toBe(true);
    expect(isSafeDeviceQuery("")).toBe(true);
  });

  it("rejects very long inputs", () => {
    expect(isSafeDeviceQuery("a".repeat(65))).toBe(false);
  });
});

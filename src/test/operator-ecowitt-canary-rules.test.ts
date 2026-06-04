import { describe, expect, it } from "vitest";
import {
  buildAuditReport,
  computeVerdict,
  evaluatePreflight,
  parseCanaryPaste,
  type CanaryReportInput,
} from "@/lib/ecowittCanaryAuditRules";

const goodTent = {
  id: "t1",
  name: "Canary",
  is_archived: false,
  hardware_config: {
    ecowitt: {
      passkey_fingerprint: "ewfp_abcdef0123",
      air_channels: [1],
      soil_channels: [1],
    },
  },
};

describe("evaluatePreflight", () => {
  it("passes numeric [1] air/soil config", () => {
    const r = evaluatePreflight({ authAvailable: true, tent: goodTent });
    expect(r.status).toBe("pass");
  });

  it("fails string ['1']", () => {
    const r = evaluatePreflight({
      authAvailable: true,
      tent: {
        ...goodTent,
        hardware_config: {
          ecowitt: { ...goodTent.hardware_config.ecowitt, air_channels: ["1"], soil_channels: ["1"] },
        },
      },
    });
    expect(r.status).toBe("fail");
    expect(r.checks.find((c) => c.key === "air_numeric")?.status).toBe("fail");
  });

  it("fails when channel 9 is present", () => {
    const r = evaluatePreflight({
      authAvailable: true,
      tent: {
        ...goodTent,
        hardware_config: {
          ecowitt: { ...goodTent.hardware_config.ecowitt, air_channels: [1, 9] },
        },
      },
    });
    expect(r.status).toBe("fail");
    expect(r.checks.find((c) => c.key === "channel_9_unmapped")?.status).toBe("fail");
  });

  it("fails missing fingerprint", () => {
    const r = evaluatePreflight({
      authAvailable: true,
      tent: {
        ...goodTent,
        hardware_config: { ecowitt: { air_channels: [1], soil_channels: [1] } },
      },
    });
    expect(r.checks.find((c) => c.key === "fingerprint")?.status).toBe("fail");
    expect(r.status).toBe("fail");
  });

  it("fails raw MAC-looking fingerprint", () => {
    const r = evaluatePreflight({
      authAvailable: true,
      tent: {
        ...goodTent,
        hardware_config: {
          ecowitt: { ...goodTent.hardware_config.ecowitt, passkey_fingerprint: "AA:BB:CC:DD:EE:FF" },
        },
      },
    });
    expect(r.checks.find((c) => c.key === "fingerprint")?.status).toBe("fail");
  });

  it("fails archived tent", () => {
    const r = evaluatePreflight({ authAvailable: true, tent: { ...goodTent, is_archived: true } });
    expect(r.checks.find((c) => c.key === "tent_active")?.status).toBe("fail");
  });

  it("returns INCOMPLETE without auth", () => {
    const r = evaluatePreflight({ authAvailable: false, tent: goodTent });
    expect(r.status).toBe("incomplete");
  });

  it("detects raw secret-like values nested in ecowitt config", () => {
    const r = evaluatePreflight({
      authAvailable: true,
      tent: {
        ...goodTent,
        hardware_config: {
          ecowitt: {
            ...goodTent.hardware_config.ecowitt,
            passkey: "DEADBEEFCAFEBABE0123",
          },
        },
      },
    });
    expect(r.checks.find((c) => c.key === "no_raw_secrets")?.status).toBe("fail");
  });
});

describe("parseCanaryPaste", () => {
  it("parses valid JSON report", () => {
    const p = parseCanaryPaste(JSON.stringify({ channel_9_count: 0 }));
    expect(p.source).toBe("json");
    expect(p.report?.channel_9_count).toBe(0);
  });
  it("returns empty when no input", () => {
    expect(parseCanaryPaste("").source).toBe("empty");
  });
  it("falls back to text with note", () => {
    const p = parseCanaryPaste("just notes");
    expect(p.source).toBe("text");
    expect(p.parseNotes.length).toBeGreaterThan(0);
  });
});

const greenReport: CanaryReportInput = {
  responses: {
    main: { http: 200, ok: true },
    duplicate: { http: 200, ok: true },
    malformed: { http: 200, ok: true },
  },
  main_row_counts: { temperature_c: 1, humidity: 1, soil_moisture: 1, vpd_kpa: 1 },
  malformed_row_counts: { humidity: 1, soil_moisture: 1 },
  duplicate_replay_counts: { temperature_c: 1, humidity: 1, soil_moisture: 1, vpd_kpa: 1 },
  channel_9_count: 0,
  leak_scan_count: 0,
  secret_value_leak_count: 0,
  null_captured_at_count: 0,
  timestamp_source_counts: { ecowitt_dateutc: 4 },
  vpd_provenance: { calculated: true, derived_from: ["temp1f", "humidity1"] },
  log_safety_status: "clean",
};

const passingPreflight = evaluatePreflight({ authAvailable: true, tent: goodTent });

describe("computeVerdict", () => {
  it("classifies all-green report as GO", () => {
    const v = computeVerdict({ preflight: passingPreflight, report: greenReport, logReviewed: true });
    expect(v.verdict).toBe("go");
  });

  it("classifies missing SQL as INCOMPLETE", () => {
    const v = computeVerdict({
      preflight: passingPreflight,
      report: { ...greenReport, main_row_counts: undefined },
      logReviewed: true,
    });
    expect(v.verdict).toBe("incomplete");
  });

  it("classifies leak scan > 0 as NO-GO", () => {
    const v = computeVerdict({
      preflight: passingPreflight,
      report: { ...greenReport, leak_scan_count: 3 },
      logReviewed: true,
    });
    expect(v.verdict).toBe("no_go");
  });

  it("classifies channel 9 > 0 as NO-GO", () => {
    const v = computeVerdict({
      preflight: passingPreflight,
      report: { ...greenReport, channel_9_count: 1 },
      logReviewed: true,
    });
    expect(v.verdict).toBe("no_go");
  });

  it("classifies duplicate count > 1 as NO-GO", () => {
    const v = computeVerdict({
      preflight: passingPreflight,
      report: { ...greenReport, duplicate_replay_counts: { humidity: 2 } },
      logReviewed: true,
    });
    expect(v.verdict).toBe("no_go");
  });

  it("classifies malformed vpd_kpa as NO-GO", () => {
    const v = computeVerdict({
      preflight: passingPreflight,
      report: { ...greenReport, malformed_row_counts: { humidity: 1, soil_moisture: 1, vpd_kpa: 1 } },
      logReviewed: true,
    });
    expect(v.verdict).toBe("no_go");
  });

  it("classifies only server_received_at as NO-GO", () => {
    const v = computeVerdict({
      preflight: passingPreflight,
      report: { ...greenReport, timestamp_source_counts: { server_received_at: 4 } },
      logReviewed: true,
    });
    expect(v.verdict).toBe("no_go");
  });

  it("preflight fail forces NO-GO", () => {
    const failedPre = evaluatePreflight({
      authAvailable: true,
      tent: { ...goodTent, is_archived: true },
    });
    const v = computeVerdict({ preflight: failedPre, report: greenReport, logReviewed: true });
    expect(v.verdict).toBe("no_go");
  });
});

describe("buildAuditReport", () => {
  it("includes verdict and safety notes, never includes raw secrets", () => {
    const verdict = computeVerdict({ preflight: passingPreflight, report: greenReport, logReviewed: true });
    const r = buildAuditReport({
      tent: { id: "t1", name: "Canary" },
      endpoint: "/functions/v1/ecowitt-ingest",
      preflight: passingPreflight,
      report: greenReport,
      verdict,
    });
    expect(r.verdict).toBe("go");
    expect(r.safety_notes).toContain("Read-only diagnostics.");
    const serialized = JSON.stringify(r);
    expect(serialized).not.toMatch(/AA:BB:CC:DD:EE:FF/);
    expect(serialized).not.toMatch(/vbt_/);
  });
});

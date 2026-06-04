import { describe, expect, it, beforeEach } from "vitest";
import {
  buildAuditReport,
  clearAuditFromLocalStorage,
  computeVerdict,
  evaluatePreflight,
  loadAuditFromLocalStorage,
  REPORT_VERSION,
  redactReport,
  saveAuditToLocalStorage,
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

const goodPreflight = evaluatePreflight({ authAvailable: true, tent: goodTent });

describe("specific failure explanations", () => {
  it("string air_channels yields the numeric-array explanation", () => {
    const r = evaluatePreflight({
      authAvailable: true,
      tent: {
        ...goodTent,
        hardware_config: {
          ecowitt: { ...goodTent.hardware_config.ecowitt, air_channels: ["1"], soil_channels: [1] },
        },
      },
    });
    const c = r.checks.find((x) => x.key === "air_numeric")!;
    expect(c.status).toBe("fail");
    expect(c.detail).toMatch(/numeric array \[1\]/);
    expect(c.detail).toMatch(/\["1"\]/);
  });

  it("channel 9 yields the canary-invalid explanation", () => {
    const r = evaluatePreflight({
      authAvailable: true,
      tent: {
        ...goodTent,
        hardware_config: { ecowitt: { ...goodTent.hardware_config.ecowitt, air_channels: [1, 9] } },
      },
    });
    const c = r.checks.find((x) => x.key === "channel_9_unmapped")!;
    expect(c.detail).toMatch(/Channel 9 must remain unmapped/);
  });

  it("missing fingerprint yields the fingerprint explanation", () => {
    const r = evaluatePreflight({
      authAvailable: true,
      tent: {
        ...goodTent,
        hardware_config: { ecowitt: { air_channels: [1], soil_channels: [1] } },
      },
    });
    const c = r.checks.find((x) => x.key === "fingerprint")!;
    expect(c.detail).toMatch(/passkey_fingerprint is missing/);
    expect(c.detail).toMatch(/ewfp_/);
  });

  it("server_received_at-only yields timestamp warning", () => {
    const v = computeVerdict({
      preflight: goodPreflight,
      report: { ...greenReport, timestamp_source_counts: { server_received_at: 4 } },
      logReviewed: true,
    });
    const c = v.cards.find((x) => x.key === "ts")!;
    expect(c.status).toBe("fail");
    expect(c.reason).toMatch(/timestamp_source = ecowitt_dateutc/);
    expect(c.reason).toMatch(/clock-sanity/);
  });

  it("duplicate count > 1 yields dedupe explanation", () => {
    const v = computeVerdict({
      preflight: goodPreflight,
      report: { ...greenReport, duplicate_replay_counts: { humidity: 2 } },
      logReviewed: true,
    });
    const c = v.cards.find((x) => x.key === "dup")!;
    expect(c.reason).toMatch(/sensor_readings_dedupe_uidx/);
  });

  it("malformed VPD yields the hard-fail explanation", () => {
    const v = computeVerdict({
      preflight: goodPreflight,
      report: {
        ...greenReport,
        malformed_row_counts: { humidity: 1, soil_moisture: 1, vpd_kpa: 1 },
      },
      logReviewed: true,
    });
    const c = v.cards.find((x) => x.key === "sql_malformed")!;
    expect(c.status).toBe("fail");
    expect(c.reason).toMatch(/Hard fail: VPD was generated from malformed/);
  });

  it("leak count > 0 yields secret-safety explanation", () => {
    const v = computeVerdict({
      preflight: goodPreflight,
      report: { ...greenReport, leak_scan_count: 3 },
      logReviewed: true,
    });
    const c = v.cards.find((x) => x.key === "secrets")!;
    expect(c.status).toBe("fail");
    expect(c.reason).toMatch(/Stop before live gateway/);
  });
});

describe("evidence checklist", () => {
  it("PASS card shows evidence_present", () => {
    const v = computeVerdict({ preflight: goodPreflight, report: greenReport, logReviewed: true });
    const c = v.cards.find((x) => x.key === "sql_main")!;
    expect(c.status).toBe("pass");
    expect(c.evidence_present.length).toBeGreaterThan(0);
    expect(c.evidence_missing.length).toBe(0);
  });

  it("FAIL card shows failing evidence + next_action", () => {
    const v = computeVerdict({
      preflight: goodPreflight,
      report: { ...greenReport, channel_9_count: 2 },
      logReviewed: true,
    });
    const c = v.cards.find((x) => x.key === "ch9")!;
    expect(c.status).toBe("fail");
    expect(c.evidence_missing.some((e) => e.includes("channel_9_count=2"))).toBe(true);
    expect(c.next_action).toBeTruthy();
  });

  it("INCOMPLETE card shows missing evidence", () => {
    const v = computeVerdict({ preflight: null, report: null, logReviewed: false });
    const c = v.cards.find((x) => x.key === "posts")!;
    expect(c.status).toBe("incomplete");
    expect(c.evidence_missing.length).toBeGreaterThan(0);
  });

  it("never shows PASS when required evidence is missing", () => {
    const v = computeVerdict({ preflight: goodPreflight, report: {}, logReviewed: true });
    for (const card of v.cards) {
      if (card.status === "pass") {
        expect(card.evidence_present.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("redacted JSON audit export", () => {
  const verdict = computeVerdict({ preflight: goodPreflight, report: greenReport, logReviewed: true });

  it("includes report_version, verdict, cards, evidence, summaries", () => {
    const a = buildAuditReport({
      tent: { id: "t1", name: "Canary" },
      endpoint: "/functions/v1/ecowitt-ingest",
      preflight: goodPreflight,
      report: greenReport,
      verdict,
    });
    expect(a.report_version).toBe(REPORT_VERSION);
    expect(a.verdict).toBe("go");
    expect(Array.isArray(a.cards)).toBe(true);
    expect(a.cards.some((c) => c.evidence_present)).toBe(true);
    expect(a.preflight_summary.status).toBe("pass");
    expect(a.imported_report).toBeTruthy();
  });

  it("excludes secrets/tokens/raw payload/user IDs even if pasted input had them", () => {
    const dirty: CanaryReportInput & Record<string, unknown> = {
      ...greenReport,
      // forbidden top-level keys that must be stripped
      ...({
        passkey: "AABBCCDDEEFF0011",
        mac: "AA:BB:CC:DD:EE:FF",
        bridge_token: "vbt_canary_fake_token_value",
        api_key: "sk_live_fake",
        application_key: "ak_fake",
        service_role: "srv_role_fake",
        user_id: "00000000-0000-0000-0000-000000000000",
        raw_payload: { passkey: "DEADBEEFCAFEBABE0123" },
      } as Record<string, unknown>),
    };
    const v = computeVerdict({ preflight: goodPreflight, report: dirty, logReviewed: true });
    const a = buildAuditReport({
      tent: { id: "t1", name: "Canary" },
      endpoint: "/functions/v1/ecowitt-ingest",
      preflight: goodPreflight,
      report: dirty,
      verdict: v,
    });
    const json = JSON.stringify(a);
    expect(json).not.toMatch(/AA:BB:CC:DD:EE:FF/);
    expect(json).not.toMatch(/vbt_canary_fake_token_value/);
    expect(json).not.toMatch(/sk_live_fake/);
    expect(json).not.toMatch(/srv_role_fake/);
    expect(json).not.toMatch(/DEADBEEFCAFEBABE0123/);
    expect(json).not.toMatch(/ak_fake/);
    // user_id / raw_payload should not appear as JSON keys with values
    expect(a.imported_report as unknown as Record<string, unknown>).not.toHaveProperty("passkey");
    expect(a.imported_report as unknown as Record<string, unknown>).not.toHaveProperty("mac");
    expect(a.imported_report as unknown as Record<string, unknown>).not.toHaveProperty("bridge_token");
    expect(a.imported_report as unknown as Record<string, unknown>).not.toHaveProperty("user_id");
    expect(a.imported_report as unknown as Record<string, unknown>).not.toHaveProperty("raw_payload");
  });

  it("redactReport strips secret-like strings deep", () => {
    const out = redactReport({
      ...greenReport,
      vpd_provenance: { calculated: true, derived_from: ["AABBCCDDEEFF0011", "humidity1"] },
    });
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/AABBCCDDEEFF0011/);
    expect(json).toMatch(/REDACTED/);
  });
});

describe("localStorage save/restore/clear", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const verdict = computeVerdict({ preflight: goodPreflight, report: greenReport, logReviewed: true });
  const built = buildAuditReport({
    tent: { id: "t1", name: "Canary" },
    endpoint: "/functions/v1/ecowitt-ingest",
    preflight: goodPreflight,
    report: greenReport,
    verdict,
  });

  it("save stores only redacted parsed audit", () => {
    saveAuditToLocalStorage(built);
    const restored = loadAuditFromLocalStorage();
    expect(restored).toBeTruthy();
    expect(restored?.report_version).toBe(REPORT_VERSION);
    expect(restored?.restored).toBe(true);
    expect(restored?.verdict).toBe("go");
  });

  it("clear removes saved audit", () => {
    saveAuditToLocalStorage(built);
    clearAuditFromLocalStorage();
    expect(loadAuditFromLocalStorage()).toBeNull();
  });

  it("never stores raw pasted text", () => {
    saveAuditToLocalStorage(built);
    const raw = localStorage.getItem("operator.ecowitt.canary.audit.v1") ?? "";
    expect(raw).not.toMatch(/pasted_text/i);
    expect(raw).not.toMatch(/<paste>/i);
  });

  it("never stores secret values when audit input had them", () => {
    const dirty = {
      ...greenReport,
      ...({
        passkey: "AABBCCDDEEFF0011",
        mac: "AA:BB:CC:DD:EE:FF",
        bridge_token: "vbt_fake_token_canary",
        user_id: "uid-1234",
      } as Record<string, unknown>),
    } as CanaryReportInput;
    const v = computeVerdict({ preflight: goodPreflight, report: dirty, logReviewed: true });
    const a = buildAuditReport({
      tent: { id: "t1", name: "Canary" },
      endpoint: "/functions/v1/ecowitt-ingest",
      preflight: goodPreflight,
      report: dirty,
      verdict: v,
    });
    saveAuditToLocalStorage(a);
    const raw = localStorage.getItem("operator.ecowitt.canary.audit.v1") ?? "";
    expect(raw).not.toMatch(/AA:BB:CC:DD:EE:FF/);
    expect(raw).not.toMatch(/vbt_fake_token_canary/);
    expect(raw).not.toMatch(/AABBCCDDEEFF0011/);
    expect(raw).not.toMatch(/uid-1234/);
  });

  it("returns null when no saved audit exists", () => {
    expect(loadAuditFromLocalStorage()).toBeNull();
  });
});

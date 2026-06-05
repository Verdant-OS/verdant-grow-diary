/**
 * Operator EcoWitt Canary — workflow persistence, secret-blocked import,
 * drill-down, and verdict export polish.
 *
 * Static-source assertions + pure-helper assertions only. No Supabase
 * writes, no functions.invoke, no browser POSTs to ecowitt-ingest.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAuditReport,
  buildDrillDown,
  buildVerdictCsv,
  buildVerdictExport,
  buildWorkflowSnapshot,
  clearWorkflowFromLocalStorage,
  computeVerdict,
  detectSecretCategories,
  evaluatePreflight,
  loadWorkflowFromLocalStorage,
  saveWorkflowToLocalStorage,
  VERDICT_REPORT_VERSION,
  WORKFLOW_STORAGE_KEY,
  type CanaryReportInput,
} from "@/lib/ecowittCanaryAuditRules";

const pageSrc = readFileSync(resolve(process.cwd(), "src/pages/OperatorEcowittCanary.tsx"), "utf8");

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

const goodReport: CanaryReportInput = {
  responses: {
    main: { http: 200, ok: true },
    duplicate: { http: 200, ok: true },
    malformed: { http: 400, ok: false },
  },
  main_row_counts: { temperature_c: 1, humidity: 1, soil_moisture: 1, vpd_kpa: 1 },
  malformed_row_counts: { humidity: 1, soil_moisture: 1 },
  duplicate_replay_counts: { temperature_c: 1, humidity: 1, soil_moisture: 1, vpd_kpa: 1 },
  channel_9_count: 0,
  leak_scan_count: 0,
  secret_value_leak_count: 0,
  null_captured_at_count: 0,
  timestamp_source_counts: { ecowitt_dateutc: 4 },
  vpd_provenance: { calculated: true, derived_from: ["temperature_c", "humidity"] },
  log_safety_status: "clean",
};

describe("detectSecretCategories", () => {
  it("returns empty for fully redacted text", () => {
    const txt = "Bridge Token: vbt_REDACTED\nPASSKEY: PASSKEY_REDACTED\nMAC: MAC_REDACTED";
    expect(detectSecretCategories(txt)).toEqual([]);
  });
  it("flags real-looking bridge token", () => {
    expect(detectSecretCategories("vbt_live_AbCdEf0123456")).toContain("bridge token (vbt_)");
  });
  it("flags MAC address", () => {
    expect(detectSecretCategories("device MAC AA:BB:CC:DD:EE:FF reported")).toContain("MAC address");
  });
  it("flags JWT, sk_, service_role, api_key, application_key", () => {
    const t =
      "x: eyJabcdefghij.klmnopqrst sk_abcdef1234567 service_role api_key=foobar123 application_key=baz123";
    const cats = detectSecretCategories(t);
    expect(cats).toEqual(
      expect.arrayContaining([
        "JWT-like (eyJ...)",
        "Stripe-like (sk_)",
        "service_role literal",
        "api_key=value",
        "application_key=value",
      ]),
    );
  });
  it("flags PASSKEY= / MAC= with non-redacted value", () => {
    const cats = detectSecretCategories("PASSKEY=ABCDEF0123456789 MAC=AA:BB:CC:DD:EE:FF");
    expect(cats).toEqual(expect.arrayContaining(["PASSKEY= non-redacted", "MAC= non-redacted"]));
  });
  it("flags 32+ char hex outside ewfp_ context", () => {
    expect(detectSecretCategories("hash 0123456789abcdef0123456789abcdef")).toContain(
      "long hex string (32+ chars)",
    );
  });
  it("does not flag values inside ewfp_ fingerprint", () => {
    expect(detectSecretCategories("fp ewfp_0123456789abcdef0123456789abcdef")).not.toContain(
      "long hex string (32+ chars)",
    );
  });
  it("never returns raw secret values, only category names", () => {
    const cats = detectSecretCategories("vbt_supersecret_value");
    for (const c of cats) expect(c).not.toContain("supersecret");
  });
});

describe("workflow snapshot persistence", () => {
  beforeEach(() => clearWorkflowFromLocalStorage());

  const verdict = computeVerdict({ preflight: null, report: goodReport, logReviewed: true });
  const snap = buildWorkflowSnapshot({ preflight: null, report: goodReport, verdict });

  it("snapshot has schema + redacted state only (no raw paste field)", () => {
    expect(snap.schema).toBe(WORKFLOW_STORAGE_KEY);
    expect(snap.counts.pass).toBeGreaterThan(0);
    // ensure no raw paste / textarea blob is captured
    expect(JSON.stringify(snap)).not.toContain("rawPaste");
    expect(JSON.stringify(snap)).not.toContain("raw_pasted_text");
  });

  it("save → load round-trips", () => {
    const r = saveWorkflowToLocalStorage(snap);
    expect(r.ok).toBe(true);
    const loaded = loadWorkflowFromLocalStorage();
    expect(loaded?.verdict).toBe(snap.verdict);
    expect(loaded?.report_metadata.has_sql_verification).toBe(true);
  });

  it("clear removes saved workflow", () => {
    saveWorkflowToLocalStorage(snap);
    clearWorkflowFromLocalStorage();
    expect(loadWorkflowFromLocalStorage()).toBeNull();
  });

  it("refuses to save when snapshot contains secret-looking content", () => {
    const bad: typeof snap = { ...snap, saved_at: "MAC=AA:BB:CC:DD:EE:FF" };
    const r = saveWorkflowToLocalStorage(bad);
    expect(r.ok).toBe(false);
    expect(loadWorkflowFromLocalStorage()).toBeNull();
  });
});

describe("buildDrillDown", () => {
  const v = computeVerdict({ preflight: null, report: goodReport, logReviewed: true });
  const find = (k: string) => v.cards.find((c) => c.key === k)!;

  it("returns offending row for channel 9 fail", () => {
    const r = { ...goodReport, channel_9_count: 3 };
    const vv = computeVerdict({ preflight: null, report: r, logReviewed: true });
    const d = buildDrillDown(vv.cards.find((c) => c.key === "ch9")!, r);
    expect(d.status).toBe("fail");
    expect(d.offending.join(",")).toContain("channel_9_count=3");
  });

  it("returns offending forbidden metric for malformed fail", () => {
    const r: CanaryReportInput = {
      ...goodReport,
      malformed_row_counts: { humidity: 1, soil_moisture: 1, vpd_kpa: 1 },
    };
    const vv = computeVerdict({ preflight: null, report: r, logReviewed: true });
    const d = buildDrillDown(vv.cards.find((c) => c.key === "sql_malformed")!, r);
    expect(d.status).toBe("fail");
    expect(d.offending.join(",")).toContain("vpd_kpa");
  });

  it("returns offending duplicate metric for dedupe fail", () => {
    const r: CanaryReportInput = {
      ...goodReport,
      duplicate_replay_counts: { temperature_c: 2, humidity: 1, soil_moisture: 1, vpd_kpa: 1 },
    };
    const vv = computeVerdict({ preflight: null, report: r, logReviewed: true });
    const d = buildDrillDown(vv.cards.find((c) => c.key === "dup")!, r);
    expect(d.status).toBe("fail");
    expect(d.offending.some((o) => o.startsWith("temperature_c=2"))).toBe(true);
  });

  it("marks unavailable when card incomplete and no offending evidence", () => {
    const d = buildDrillDown(find("preflight"), goodReport);
    expect(d.status).toBe("incomplete");
    expect(d.unavailable || d.offending.length > 0).toBe(true);
  });
});

describe("verdict exports", () => {
  const verdict = computeVerdict({ preflight: null, report: goodReport, logReviewed: true });
  const audit = buildAuditReport({
    tent: { id: "t1", name: "Canary" },
    endpoint: "/functions/v1/ecowitt-ingest",
    preflight: null,
    report: goodReport,
    verdict,
  });

  it("JSON export has report_version + verdict + evidence checklist; excludes secrets", () => {
    const exp = buildVerdictExport(audit);
    expect(exp.report_version).toBe(VERDICT_REPORT_VERSION);
    expect(["go", "no_go", "incomplete"]).toContain(exp.verdict);
    expect(exp.evidence_checklist.length).toBeGreaterThan(0);
    const s = JSON.stringify(exp);
    expect(s).not.toMatch(/vbt_(?!REDACTED)/);
    expect(s).not.toMatch(/service_role/i);
    expect(s).not.toMatch(/PASSKEY\s*[=:]\s*[A-F0-9]/);
    expect(s).not.toContain("raw_payload");
  });

  it("CSV export has required columns and verdict", () => {
    const csv = buildVerdictCsv(audit);
    const header = csv.split("\n")[0];
    expect(header.split(",")).toEqual([
      "category",
      "status",
      "evidence_present",
      "evidence_missing",
      "next_action",
      "value",
      "expected",
      "verdict",
    ]);
    expect(csv).toMatch(/(incomplete|no_go|go)/);
    expect(csv).not.toMatch(/vbt_(?!REDACTED)/);
    expect(csv).not.toMatch(/service_role/i);
  });
});

describe("Operator page wiring (static source)", () => {
  it("renders the dedicated Import canary output card", () => {
    expect(pageSrc).toContain('data-testid="import-canary-output"');
    expect(pageSrc).toContain("Import canary output");
    expect(pageSrc).toContain('data-testid="import-redacted-output"');
    expect(pageSrc).toContain('data-testid="clear-import"');
    expect(pageSrc).toContain('accept=".txt,.json"');
  });

  it("renders the secret-detected warning and saved-workflow banner", () => {
    expect(pageSrc).toContain('data-testid="import-secret-warning"');
    expect(pageSrc).toContain("Possible unredacted secret detected");
    expect(pageSrc).toContain('data-testid="saved-workflow-banner"');
    expect(pageSrc).toContain('data-testid="restore-saved-workflow"');
    expect(pageSrc).toContain('data-testid="clear-saved-workflow"');
    expect(pageSrc).toContain('data-testid="restored-from-local"');
  });

  it("wires verdict JSON + CSV download buttons in dashboard", () => {
    expect(pageSrc).toContain('data-testid="download-verdict-json"');
    expect(pageSrc).toContain('data-testid="download-verdict-csv"');
    expect(pageSrc).toContain("buildVerdictExport");
    expect(pageSrc).toContain("buildVerdictCsv");
  });

  it("passes drill-down to every evidence card", () => {
    expect(pageSrc).toContain("drill={buildDrillDown(c, report)}");
    expect(pageSrc).toContain("drilldown-toggle-");
  });

  it("has no forbidden write/automation surfaces", () => {
    const stripped = pageSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const f of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc(", "functions.invoke"]) {
      expect(stripped, `forbidden token ${f}`).not.toContain(f);
    }
    expect(stripped).not.toMatch(/fetch\s*\(\s*["'`][^"'`]*ecowitt-ingest/);
  });
});

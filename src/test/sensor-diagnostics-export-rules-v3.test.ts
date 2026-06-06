import { describe, expect, it } from "vitest";
import {
  buildCanonicalIngestPayloadValidation,
  buildDiagnosticsBundleFiles,
  buildPowerShellCopyWarningState,
  buildSafeResponseInspector,
  buildSensorIngestTestPayload,
} from "@/lib/sensorDiagnosticsExportRules";

const PLAINTEXT = "vbt_PLAINTEXT_DO_NOT_LEAK_abcdef1234";

describe("buildPowerShellCopyWarningState", () => {
  it("requires confirmation when token reveal is active", () => {
    const w = buildPowerShellCopyWarningState({ hasTokenReveal: true });
    expect(w.requiresConfirmation).toBe(true);
    expect(w.message).toMatch(/one-time bridge token/i);
    expect(w.message).toMatch(/tickets|chats|screenshots|shared docs/i);
  });

  it("does not require confirmation when token reveal is inactive", () => {
    const w = buildPowerShellCopyWarningState({ hasTokenReveal: false });
    expect(w.requiresConfirmation).toBe(false);
    expect(w.message).toBe("");
  });
});

describe("buildDiagnosticsBundleFiles", () => {
  it("includes diagnostics JSON, diagnostics text, and history JSON", () => {
    const files = buildDiagnosticsBundleFiles({
      diagnosticsJson: '{"x":1}',
      diagnosticsText: "summary",
      historyJson: '{"items":[]}',
    });
    const names = files.map((f) => f.name).sort();
    expect(names).toEqual(["diagnostics.json", "diagnostics.txt", "history.json"]);
    expect(files.find((f) => f.name === "diagnostics.json")?.content).toBe('{"x":1}');
    expect(files.find((f) => f.name === "diagnostics.txt")?.content).toBe("summary");
    expect(files.find((f) => f.name === "history.json")?.content).toBe('{"items":[]}');
  });
});

describe("buildSafeResponseInspector", () => {
  it("returns status and classification for JSON bodies", () => {
    const insp = buildSafeResponseInspector({
      status: 200,
      classification: "accepted",
      body: { ok: true, inserted: 1 },
    });
    expect(insp.http_status).toBe(200);
    expect(insp.classification).toBe("accepted");
    expect(insp.kind).toBe("json");
    const root = insp.fields.find((f) => f.path === "$");
    expect(root?.type).toBe("object");
    expect(insp.fields.some((f) => f.path === "ok" && f.preview === "true")).toBe(true);
  });

  it("redacts sensitive keys deeply (token/authorization/secret/bridge_token/api_key/service_role/anon_key/password)", () => {
    const insp = buildSafeResponseInspector({
      status: 200,
      classification: "accepted",
      body: {
        token: PLAINTEXT,
        Authorization: `Bearer ${PLAINTEXT}`,
        api_key: "abc",
        secret: "shh",
        password: "p",
        service_role: "x",
        anon_key: "y",
        bridge_token: PLAINTEXT,
        nested: { bearer: PLAINTEXT, ok: true },
      },
    });
    for (const key of [
      "token",
      "Authorization",
      "api_key",
      "secret",
      "password",
      "service_role",
      "anon_key",
      "bridge_token",
      "nested.bearer",
    ]) {
      const f = insp.fields.find((x) => x.path === key);
      expect(f, `missing ${key}`).toBeTruthy();
      expect(f?.preview).toBe("<redacted>");
      expect(f?.redacted).toBe(true);
    }
    const serialized = JSON.stringify(insp);
    expect(serialized).not.toContain(PLAINTEXT);
  });

  it("handles non-JSON string bodies safely", () => {
    const insp = buildSafeResponseInspector({
      status: 500,
      classification: "server_error",
      body: `Internal error with stray ${PLAINTEXT} token`,
    });
    expect(insp.kind).toBe("text");
    expect(insp.fields[0].preview).not.toContain(PLAINTEXT);
    expect(insp.fields[0].redacted).toBe(true);
  });

  it("handles empty / null body", () => {
    const insp = buildSafeResponseInspector({
      status: 204,
      classification: "accepted",
      body: null,
    });
    expect(insp.kind).toBe("empty");
    expect(insp.fields).toEqual([]);
  });
});

describe("buildCanonicalIngestPayloadValidation", () => {
  it("passes for the canonical test payload (with at least one valid reading)", () => {
    const payload = buildSensorIngestTestPayload({
      tentId: "tent-1",
      capturedAtIso: "2026-06-06T18:00:00Z",
    });
    const v = buildCanonicalIngestPayloadValidation(payload);
    expect(v.ready).toBe(true);
    expect(v.missing).toEqual([]);
    expect(v.invalid).toEqual([]);
    expect(v.present).toEqual(
      expect.arrayContaining(["source", "captured_at", "tent_id", "confidence", "readings"]),
    );
    expect(v.readingsCount).toBeGreaterThan(0);
  });

  it("fails when source/captured_at/tent_id/confidence/readings are missing", () => {
    const v = buildCanonicalIngestPayloadValidation({});
    expect(v.ready).toBe(false);
    expect(v.missing).toEqual(
      expect.arrayContaining(["source", "captured_at", "tent_id", "confidence", "readings"]),
    );
  });

  it("fails for null / non-object payload", () => {
    expect(buildCanonicalIngestPayloadValidation(null).ready).toBe(false);
    expect(buildCanonicalIngestPayloadValidation(42).ready).toBe(false);
    expect(buildCanonicalIngestPayloadValidation([]).ready).toBe(false);
  });

  it("accepts top-level confidence and timestamp aliases", () => {
    const v = buildCanonicalIngestPayloadValidation({
      tent_id: "t",
      source: "ecowitt",
      timestamp: "2026-06-06T18:00:00Z",
      confidence: "live",
      readings: { temp_f: 72.1 },
    });
    expect(v.ready).toBe(true);
    expect(v.readingsCount).toBe(1);
  });

  it("flags invalid captured_at and empty readings", () => {
    const v = buildCanonicalIngestPayloadValidation({
      tent_id: "t",
      source: "ecowitt",
      captured_at: "not-a-date",
      metadata: { confidence: "test" },
      readings: {},
    });
    expect(v.ready).toBe(false);
    expect(v.invalid.some((i) => i.field === "captured_at")).toBe(true);
    // readings empty -> invalid (no valid values)
    expect(v.invalid.some((i) => i.field === "readings")).toBe(true);
  });

  it("does not hard-block when raw_payload is absent", () => {
    const v = buildCanonicalIngestPayloadValidation({
      tent_id: "t",
      source: "ecowitt",
      captured_at: "2026-06-06T18:00:00Z",
      confidence: "test",
      readings: { temp_f: 70 },
    });
    expect(v.ready).toBe(true);
  });
});

import {
  buildDiagnosticsBundleFilenamePreview,
  buildDownloadFilename,
  buildSensorTestbenchValidationUiState,
  formatSafeResponseInspectorPlainText,
} from "@/lib/sensorDiagnosticsExportRules";

describe("buildSensorTestbenchValidationUiState", () => {
  function v(payload: unknown) {
    return buildCanonicalIngestPayloadValidation(payload);
  }
  const goodPayload = buildSensorIngestTestPayload({
    tentId: "tent-1",
    capturedAtIso: "2026-06-06T18:00:00Z",
  });

  it("returns no_test_yet when ready but no last test (calm empty state, actions enabled)", () => {
    const ui = buildSensorTestbenchValidationUiState({
      validation: v(goodPayload),
      hasLastTest: false,
    });
    expect(ui.status).toBe("no_test_yet");
    expect(ui.statusLabel).toBe("No test yet");
    expect(ui.actionsDisabled).toBe(false);
    expect(ui.disabledReason).toBeNull();
    expect(ui.emptyStateMessage).toMatch(/Run a test to generate/i);
    // No scary invalid copy
    expect(ui.emptyStateMessage).not.toMatch(/invalid/i);
  });

  it("returns ready when payload valid and last test exists", () => {
    const ui = buildSensorTestbenchValidationUiState({
      validation: v(goodPayload),
      hasLastTest: true,
    });
    expect(ui.status).toBe("ready");
    expect(ui.actionsDisabled).toBe(false);
    expect(ui.badgeTone).toBe("ready");
  });

  it("names exactly the single missing field in disabled reason", () => {
    const partial = { ...goodPayload, source: undefined } as unknown;
    const ui = buildSensorTestbenchValidationUiState({
      validation: v(partial),
      hasLastTest: false,
    });
    expect(ui.status).toBe("not_ready");
    expect(ui.actionsDisabled).toBe(true);
    expect(ui.disabledReason).toMatch(/Disabled until canonical payload includes source\.?$/);
    // No comma when only one field
    expect(ui.disabledReason).not.toMatch(/,/);
  });

  it("lists all missing required fields when several missing", () => {
    const ui = buildSensorTestbenchValidationUiState({
      validation: v({}),
      hasLastTest: false,
    });
    expect(ui.disabledReason).toMatch(/source/);
    expect(ui.disabledReason).toMatch(/captured_at/);
    expect(ui.disabledReason).toMatch(/tent_id/);
    expect(ui.disabledReason).toMatch(/confidence/);
    expect(ui.disabledReason).toMatch(/readings/);
  });

  it("invalid readings object produces clear reason and disables actions", () => {
    const ui = buildSensorTestbenchValidationUiState({
      validation: v({
        tent_id: "t",
        source: "ecowitt",
        captured_at: "2026-06-06T18:00:00Z",
        confidence: "test",
        readings: {},
      }),
      hasLastTest: true,
    });
    expect(ui.status).toBe("not_ready");
    expect(ui.actionsDisabled).toBe(true);
    expect(
      ui.summary.invalid.some(
        (i) => i.field === "readings" && /empty readings object/i.test(i.reason),
      ),
    ).toBe(true);
    expect(ui.disabledReason).toMatch(/readings/);
  });

  it("malformed captured_at flagged as invalid with specific reason", () => {
    const ui = buildSensorTestbenchValidationUiState({
      validation: v({
        tent_id: "t",
        source: "ecowitt",
        captured_at: "not-a-date",
        confidence: "test",
        readings: { temp_f: 70 },
      }),
      hasLastTest: true,
    });
    expect(
      ui.summary.invalid.some(
        (i) => i.field === "captured_at" && /malformed timestamp/i.test(i.reason),
      ),
    ).toBe(true);
  });

  it("missing source/tent_id/confidence carry field-specific reasons", () => {
    const ui = buildSensorTestbenchValidationUiState({
      validation: v({
        readings: { x: 1 },
        captured_at: "2026-06-06T18:00:00Z",
      }),
      hasLastTest: true,
    });
    const missingByField = Object.fromEntries(
      ui.summary.missing.map((m) => [m.field, m.reason]),
    );
    expect(missingByField.source).toMatch(/source/i);
    expect(missingByField.tent_id).toMatch(/tent/i);
    expect(missingByField.confidence).toMatch(/confidence|invalid/i);
  });

  it("raw_payload is in optional summary, not required", () => {
    const ui = buildSensorTestbenchValidationUiState({
      validation: v(goodPayload),
      hasLastTest: true,
    });
    expect(ui.summary.optional).toContain("raw_payload");
    expect(ui.summary.missing.map((m) => m.field)).not.toContain(
      "raw_payload" as never,
    );
  });
});

describe("buildDiagnosticsBundleFilenamePreview", () => {
  it("uses buildDownloadFilename with the bundle prefix and .zip extension", () => {
    const d = new Date(Date.UTC(2026, 5, 6, 18, 0, 0));
    const preview = buildDiagnosticsBundleFilenamePreview(d);
    const expected = buildDownloadFilename(
      "verdant-sensor-diagnostics-bundle",
      "zip",
      d,
    );
    expect(preview).toBe(expected);
    expect(preview).toBe(
      "verdant-sensor-diagnostics-bundle-20260606-180000.zip",
    );
  });
});

describe("formatSafeResponseInspectorPlainText", () => {
  it("includes HTTP status, classification, and redacted breakdown", () => {
    const insp = buildSafeResponseInspector({
      status: 200,
      classification: "accepted",
      body: { ok: true, token: PLAINTEXT, nested: { authorization: PLAINTEXT, ok: false } },
    });
    const text = formatSafeResponseInspectorPlainText(insp);
    expect(text).toMatch(/HTTP 200/);
    expect(text).toMatch(/classification: accepted/);
    expect(text).toMatch(/breakdown:/);
    // Sensitive keys appear marked redacted, never raw plaintext.
    expect(text).not.toContain(PLAINTEXT);
    expect(text).toMatch(/\[redacted\]/);
  });

  it("handles non-JSON and empty bodies safely", () => {
    const nonJson = formatSafeResponseInspectorPlainText(
      buildSafeResponseInspector({
        status: 500,
        classification: "server_error",
        body: `oops ${PLAINTEXT}`,
      }),
    );
    expect(nonJson).toMatch(/HTTP 500/);
    expect(nonJson).not.toContain(PLAINTEXT);

    const empty = formatSafeResponseInspectorPlainText(
      buildSafeResponseInspector({
        status: 204,
        classification: "accepted",
        body: null,
      }),
    );
    expect(empty).toMatch(/HTTP 204/);
    expect(empty).toMatch(/\(empty\)/);
  });
});

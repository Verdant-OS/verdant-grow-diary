/**
 * ecowittForwardingReportExport — sanitization boundary tests (issue #1003).
 *
 * Safety contract under test:
 *  - Output allowlist on BOTH metric envelope paths (error-report AND the
 *    status fallback): captured_at must be timestamp-shaped, source must be
 *    canonical vocabulary (unknown → "invalid", never echoed, never live),
 *    vendor must be a plain lowercase vendor slug.
 *  - Credential VALUES — not just field names — never survive to the built
 *    object or the serialized text: JWTs, vbt_ bridge tokens, Bearer values,
 *    hex passkey material, MAC addresses, UUID private ids.
 *  - Forbidden fields supplied in fixtures (raw_payload, Authorization,
 *    bridge_token, unknown metric keys) are proven absent from output.
 *  - serializeSanitizedForwardingReport prunes recursively to the exact
 *    report shape before stringifying — adversarial extras injected onto
 *    the report object never reach the clipboard text.
 *  - Safe metric values and useful operator diagnostics are preserved.
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED_METRIC_KEYS,
  buildSanitizedForwardingReport,
  serializeSanitizedForwardingReport,
  type SanitizedForwardingReport,
} from "@/lib/ecowittForwardingReportExport";
import {
  sanitizeReportText,
  type LocalForwardingLatestMetrics,
  type LocalForwardingStatus,
} from "@/lib/ecowittLocalForwardingStatus";

const NOW_ISO = "2026-08-27T12:00:00.000Z";

// Credential VALUES (not just labels) that must never reach output.
const JWT_VALUE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c";
const VBT_VALUE = "vbt_live_9f8e7d6c5b4a3210";
const HEX32_PASSKEY_VALUE = "d41d8cd98f00b204e9800998ecf8427e";
const MAC_VALUE = "84:F3:EB:21:9C:01";
const UUID_PRIVATE_ID = "123e4567-e89b-42d3-a456-426614174000";

function status(over: Partial<LocalForwardingStatus> = {}): LocalForwardingStatus {
  return {
    ok: true,
    forwarding_enabled: true,
    forwarding_ready: true,
    ingest_url_configured: true,
    bridge_token_configured: true,
    tent_id_configured: true,
    tent_id_valid: true,
    last_forward_status: 200,
    last_forward_error: null,
    last_forward_response_error: null,
    last_forward_response_classification: null,
    last_forward_response_reason: null,
    last_forward_response_message: null,
    forward_success_count: 1,
    forward_failure_count: 0,
    forward_attempt_count: 1,
    forward_blocked_count: 0,
    retry_count: 0,
    last_retry_error: null,
    last_retry_at: null,
    last_retryable_status: null,
    max_retry_attempts: 3,
    recommended_next_step: "Check local listener",
    malformed_line_count: 0,
    generated_at: "2026-08-27T11:59:00.000Z",
    latest_metrics: {
      source: "live",
      vendor: "ecowitt",
      physical_gateway_evidence: true,
      captured_at: "2026-08-27T11:58:00.000Z",
      metric_keys: ["temp_f", "humidity_percent"],
    },
    ...over,
  };
}

describe("buildSanitizedForwardingReport — happy path and allowlist", () => {
  it("builds the report with fixed safety flags and canonical fields preserved", () => {
    const report = buildSanitizedForwardingReport({ status: status(), nowIso: NOW_ISO });

    expect(report.report_type).toBe("verdant_ecowitt_forwarding_debug_report");
    expect(report.generated_by).toBe("verdant_operator_mode");
    expect(report.copied_at).toBe(NOW_ISO);
    expect(report.safety).toEqual({
      sanitized: true,
      raw_payload_included: false,
      secrets_included: false,
      write_action: false,
    });
    expect(report.bridge_status.last_forward_status).toBe(200);
    expect(report.latest_metrics.captured_at).toBe("2026-08-27T11:58:00.000Z");
    expect(report.latest_metrics.source).toBe("live");
    expect(report.latest_metrics.vendor).toBe("ecowitt");
    expect(report.latest_metrics.metrics).toEqual({});
  });

  it("error-report path allowlists metric keys and drops forbidden fields", () => {
    const report = buildSanitizedForwardingReport({
      status: status(),
      errorReport: {
        recommended_next_step: "Retry after fixing tent_id",
        generated_at: "2026-08-27T11:57:00.000Z",
        malformed_line_count: 2,
        latest_metrics: {
          captured_at: "2026-08-27T11:56:00.000Z",
          source: "live",
          vendor: "ecowitt",
          metrics: {
            temp_f: 78.5,
            humidity_percent: 55,
            soil_moisture_pct: 32,
            co2_ppm: 900,
            secret_metric: 1,
            raw_payload: { stationtype: "leak", PASSKEY: HEX32_PASSKEY_VALUE },
            Authorization: `Bearer ${JWT_VALUE}`,
            bridge_token: VBT_VALUE,
          },
        },
      },
      nowIso: NOW_ISO,
    });

    expect(report.latest_metrics.metrics).toEqual({
      temp_f: 78.5,
      humidity_percent: 55,
      soil_moisture_pct: 32,
      co2_ppm: 900,
    });
    for (const key of Object.keys(report.latest_metrics.metrics)) {
      expect(ALLOWED_METRIC_KEYS).toContain(key);
    }
    const text = serializeSanitizedForwardingReport(report);
    expect(text).not.toContain("secret_metric");
    // Only the safety flag NAME raw_payload_included may appear — never
    // the raw_payload field itself or its contents.
    expect(text).not.toContain('"raw_payload"');
    expect(text).not.toContain("stationtype");
    expect(text).not.toContain(JWT_VALUE);
    expect(text).not.toContain(VBT_VALUE);
    expect(text).not.toContain(HEX32_PASSKEY_VALUE);
  });

  it("preserves safe metric values and operator diagnostics", () => {
    const report = buildSanitizedForwardingReport({
      status: status({
        last_forward_status: 401,
        last_forward_response_classification: "auth_rejected",
        last_forward_response_reason: "token_mismatch",
        recommended_next_step: "Re-enter the bridge token in the listener config",
      }),
      nowIso: NOW_ISO,
    });
    expect(report.bridge_status.last_forward_status).toBe(401);
    expect(report.bridge_status.last_forward_response_classification).toBe("auth_rejected");
    expect(report.bridge_status.last_forward_response_reason).toBe("token_mismatch");
    expect(report.bridge_status.recommended_next_step).toBe(
      "Re-enter the bridge token in the listener config",
    );
  });
});

describe("buildSanitizedForwardingReport — provenance labels", () => {
  it("unknown/non-allowlisted source normalizes to invalid, never echoed, on the error-report path", () => {
    const report = buildSanitizedForwardingReport({
      status: status(),
      errorReport: {
        latest_metrics: {
          captured_at: "2026-08-27T11:56:00.000Z",
          source: "totally_live_trust_me",
          vendor: "ecowitt",
          metrics: { temp_f: 70 },
        },
      },
      nowIso: NOW_ISO,
    });
    expect(report.latest_metrics.source).toBe("invalid");
    expect(serializeSanitizedForwardingReport(report)).not.toContain("totally_live_trust_me");
  });

  it("every canonical source label is preserved on both paths", () => {
    for (const source of ["live", "manual", "csv", "demo", "stale", "invalid"] as const) {
      const viaError = buildSanitizedForwardingReport({
        status: status(),
        errorReport: {
          latest_metrics: { captured_at: "2026-08-27T11:56:00.000Z", source, vendor: "ecowitt" },
        },
        nowIso: NOW_ISO,
      });
      expect(viaError.latest_metrics.source).toBe(source);

      const viaStatus = buildSanitizedForwardingReport({
        status: status({
          latest_metrics: {
            source,
            vendor: "ecowitt",
            physical_gateway_evidence: true,
            captured_at: "2026-08-27T11:58:00.000Z",
            metric_keys: [],
          },
        }),
        nowIso: NOW_ISO,
      });
      expect(viaStatus.latest_metrics.source).toBe(source);
    }
  });

  it("vendor is value-allowlisted: known first-party labels pass, hardware ids drop", () => {
    const cases: Array<[string, string | null]> = [
      ["ecowitt", "ecowitt"],
      ["ecowitt_mqtt", "ecowitt_mqtt"],
      ["ECOWITT_WINDOWS_TESTBENCH", "ecowitt_windows_testbench"],
      // Slug-SHAPED values are not enough — station ids embedding MAC
      // bytes, separator-free MACs, and hex passkeys are all slug-shaped
      // and must still drop (value allowlist, not shape allowlist).
      ["GW2000A-WIFI4C01", null],
      ["ACCB88AF4C01", null],
      [HEX32_PASSKEY_VALUE, null],
      ["home-assistant", null],
      [MAC_VALUE, null],
      ["GW2000A_V3.2.4", null],
      [JWT_VALUE, null],
    ];
    for (const [vendor, expected] of cases) {
      const report = buildSanitizedForwardingReport({
        status: status(),
        errorReport: {
          latest_metrics: { captured_at: "2026-08-27T11:56:00.000Z", source: "live", vendor },
        },
        nowIso: NOW_ISO,
      });
      expect(report.latest_metrics.vendor, `vendor=${vendor}`).toBe(expected);
    }
  });
});

describe("buildSanitizedForwardingReport — fallback envelope cannot bypass sanitization", () => {
  it("tainted status.latest_metrics values never survive the fallback path", () => {
    // Simulates a caller passing an unnormalized status object (the module
    // boundary must not rely on fetch-time normalization having happened).
    const taintedMetrics = {
      source: JWT_VALUE,
      vendor: MAC_VALUE,
      physical_gateway_evidence: true,
      captured_at: `boot at ${HEX32_PASSKEY_VALUE}`,
      metric_keys: ["temp_f"],
    } as LocalForwardingLatestMetrics;

    const report = buildSanitizedForwardingReport({
      status: status({ latest_metrics: taintedMetrics }),
      nowIso: NOW_ISO,
    });

    expect(report.latest_metrics.source).toBe("invalid");
    expect(report.latest_metrics.vendor).toBeNull();
    expect(report.latest_metrics.captured_at).toBeNull();

    const text = serializeSanitizedForwardingReport(report);
    expect(text).not.toContain(JWT_VALUE);
    expect(text).not.toContain(MAC_VALUE);
    expect(text).not.toContain(HEX32_PASSKEY_VALUE);
  });

  it("non-timestamp captured_at is dropped on the error-report path too", () => {
    const report = buildSanitizedForwardingReport({
      status: status(),
      errorReport: {
        latest_metrics: {
          captured_at: VBT_VALUE,
          source: "live",
          vendor: "ecowitt",
          metrics: { temp_f: 70 },
        },
      },
      nowIso: NOW_ISO,
    });
    expect(report.latest_metrics.captured_at).toBeNull();
    expect(serializeSanitizedForwardingReport(report)).not.toContain(VBT_VALUE);
  });

  it("listener space-separated timestamps remain accepted (diagnostics preserved)", () => {
    const report = buildSanitizedForwardingReport({
      status: status(),
      errorReport: {
        latest_metrics: {
          captured_at: "2026-08-27 11:56:00",
          source: "live",
          vendor: "ecowitt",
        },
      },
      nowIso: NOW_ISO,
    });
    expect(report.latest_metrics.captured_at).toBe("2026-08-27 11:56:00");
  });
});

describe("credential values in free-form diagnostics are redacted", () => {
  it("MAC addresses, hex passkey material, and UUID private ids are redacted", () => {
    const report = buildSanitizedForwardingReport({
      status: status({
        last_forward_error: `gateway ${MAC_VALUE} rejected passkey ${HEX32_PASSKEY_VALUE}`,
        last_retry_error: `tent ${UUID_PRIVATE_ID} not found`,
      }),
      nowIso: NOW_ISO,
    });
    expect(report.bridge_status.last_forward_error).not.toContain(MAC_VALUE);
    expect(report.bridge_status.last_forward_error).not.toContain(HEX32_PASSKEY_VALUE);
    expect(report.bridge_status.last_forward_error).toContain("[REDACTED]");
    expect(report.bridge_status.last_retry_error).not.toContain(UUID_PRIVATE_ID);
    expect(report.bridge_status.last_retry_error).toContain("[REDACTED]");
    // Useful context around the redaction is preserved.
    expect(report.bridge_status.last_forward_error).toContain("gateway");
    expect(report.bridge_status.last_retry_error).toContain("not found");
  });

  it("prefixed and separator-free credential values cannot evade redaction", () => {
    // Assembled at runtime so no token-shaped literal sits in this file
    // (same convention as the runtime-assembled service-role pattern).
    const sbpHex = "0102030405060708090a0b0c0d0e0f1011121314";
    const sbpToken = ["sbp", sbpHex].join("_");
    const report = buildSanitizedForwardingReport({
      status: status({
        last_forward_error:
          `sig 0x${HEX32_PASSKEY_VALUE.toUpperCase()} rejected; ` +
          `PASSKEY_${HEX32_PASSKEY_VALUE.toUpperCase()} bad; ` +
          `token ${sbpToken} invalid`,
        last_retry_error:
          "gateway 24CB88AF4C01 unauthorized; api key sk-proj-Ab3dEfG7hIjKlMnOpQr rejected; " +
          "EXAMPLE_SECRET=super-private-value leaked at epoch 1787814291682",
      }),
      nowIso: NOW_ISO,
    });

    const fwd = report.bridge_status.last_forward_error ?? "";
    const retry = report.bridge_status.last_retry_error ?? "";
    expect(fwd).not.toContain(HEX32_PASSKEY_VALUE.toUpperCase());
    expect(fwd).not.toContain(sbpHex);
    expect(retry).not.toContain("24CB88AF4C01");
    expect(retry).not.toContain("sk-proj-");
    expect(retry).not.toContain("super-private-value");
    // Plain long numbers (epoch timestamps) are NOT over-redacted —
    // operator diagnostics stay useful.
    expect(retry).toContain("1787814291682");
    expect(fwd).toContain("rejected");
    expect(retry).toContain("unauthorized");
  });

  // Leftover #1163 / #1003: \b-anchored colon/dash MAC + UUID miss when a
  // word-char prefix (mac_/tent_/0x) abuts the value. Bare forms and bare
  // hex lookarounds already hold on tip — do not rewrite those paths.
  it("word-char prefixes cannot evade colon/dash MAC or UUID redaction", () => {
    const colonMac = "aa:bb:cc:dd:ee:ff";
    const dashMac = "aa-bb-cc-dd-ee-ff";
    const report = buildSanitizedForwardingReport({
      status: status({
        last_forward_error: `device mac_${colonMac} and 0x${colonMac} rejected`,
        last_retry_error: `device mac_${dashMac}; tent_${UUID_PRIVATE_ID} missing`,
      }),
      nowIso: NOW_ISO,
    });
    const fwd = report.bridge_status.last_forward_error ?? "";
    const retry = report.bridge_status.last_retry_error ?? "";
    expect(fwd).not.toContain(colonMac);
    expect(retry).not.toContain(dashMac);
    expect(retry).not.toContain(UUID_PRIVATE_ID);
    expect(fwd).toContain("[REDACTED]");
    expect(retry).toContain("[REDACTED]");
    expect(fwd).toContain("rejected");
    expect(retry).toContain("missing");
  });

  it("quoted env NAME=value pairs redact; unquoted still works; lone words untouched", () => {
    // Direct sanitizer probe — proves the tip hole (FOO="secretvalue") and
    // the fence that lone words must not be scrubbed as credentials.
    expect(sanitizeReportText('FOO="secretvalue"')).not.toContain("secretvalue");
    expect(sanitizeReportText("FOO='secretvalue'")).not.toContain("secretvalue");
    expect(sanitizeReportText("FOO=secretvalue")).not.toContain("secretvalue");
    expect(sanitizeReportText('FOO="secretvalue"')).toContain("[REDACTED]");
    expect(sanitizeReportText("FOO=secretvalue")).toContain("[REDACTED]");
    expect(sanitizeReportText("secretvalue")).toBe("secretvalue");

    const report = buildSanitizedForwardingReport({
      status: status({
        last_forward_error: "config FOO=\"secretvalue\" and BAR='othersecret' rejected",
        last_retry_error: "config BAZ=plainsecret ok; lone secretvalue stays",
      }),
      nowIso: NOW_ISO,
    });
    const fwd = report.bridge_status.last_forward_error ?? "";
    const retry = report.bridge_status.last_retry_error ?? "";
    expect(fwd).not.toContain("secretvalue");
    expect(fwd).not.toContain("othersecret");
    expect(retry).not.toContain("plainsecret");
    expect(retry).toContain("secretvalue");
    expect(fwd).toContain("[REDACTED]");
    expect(retry).toContain("[REDACTED]");
  });

  it("JWT / vbt_ / Bearer / PASSKEY / service-role material stays redacted (regression)", () => {
    const report = buildSanitizedForwardingReport({
      status: status({
        last_forward_error: `failed Authorization: Bearer ${JWT_VALUE} with ${VBT_VALUE}`,
        last_retry_error: "PASSKEY missing service_role grant",
      }),
      nowIso: NOW_ISO,
    });
    expect(report.bridge_status.last_forward_error).not.toContain(JWT_VALUE);
    expect(report.bridge_status.last_forward_error).not.toContain(VBT_VALUE);
    expect(report.bridge_status.last_forward_error).not.toMatch(/Bearer\s+eyJ/);
    expect(report.bridge_status.last_retry_error).not.toMatch(/PASSKEY/);
    expect(report.bridge_status.last_retry_error).not.toMatch(/service_role/);
  });
});

describe("serializeSanitizedForwardingReport — recursive output allowlist", () => {
  function tamperedReport(): SanitizedForwardingReport {
    const report = buildSanitizedForwardingReport({ status: status(), nowIso: NOW_ISO });
    const loose = report as unknown as Record<string, unknown>;
    loose.raw_payload = { PASSKEY: HEX32_PASSKEY_VALUE };
    (loose.bridge_status as Record<string, unknown>).bridge_token = VBT_VALUE;
    (loose.latest_metrics as Record<string, unknown>).Authorization = `Bearer ${JWT_VALUE}`;
    (loose.latest_metrics as Record<string, unknown>).metrics = {
      temp_f: 78.5,
      secret_metric: 1,
      humidity_percent: JWT_VALUE,
    };
    (loose.bridge_status as Record<string, unknown>).generated_at = `boot ${HEX32_PASSKEY_VALUE}`;
    (loose.safety as Record<string, unknown>).write_action = true;
    return report;
  }

  it("prunes adversarial fields injected at every level before stringifying", () => {
    const text = serializeSanitizedForwardingReport(tamperedReport());
    const parsed = JSON.parse(text) as SanitizedForwardingReport;

    expect(text).not.toContain(HEX32_PASSKEY_VALUE);
    expect(text).not.toContain(VBT_VALUE);
    expect(text).not.toContain(JWT_VALUE);
    expect(text).not.toContain("secret_metric");
    expect(parsed).not.toHaveProperty("raw_payload");
    expect(parsed.bridge_status).not.toHaveProperty("bridge_token");
    expect(parsed.latest_metrics).not.toHaveProperty("Authorization");
    expect(parsed.latest_metrics.metrics).toEqual({ temp_f: 78.5 });
    // Tampered non-timestamp generated_at is dropped by the shape allowlist.
    expect(parsed.bridge_status.generated_at).toBeNull();
    // Safety flags are literals of the sanitized report shape.
    expect(parsed.safety).toEqual({
      sanitized: true,
      raw_payload_included: false,
      secrets_included: false,
      write_action: false,
    });
  });

  it("keeps the untampered report byte-stable and pretty-printed", () => {
    const report = buildSanitizedForwardingReport({ status: status(), nowIso: NOW_ISO });
    const text = serializeSanitizedForwardingReport(report);
    const parsed = JSON.parse(text) as SanitizedForwardingReport;
    expect(parsed.report_type).toBe("verdant_ecowitt_forwarding_debug_report");
    expect(parsed.bridge_status.last_forward_status).toBe(200);
    expect(parsed.latest_metrics.vendor).toBe("ecowitt");
    expect(text).toMatch(/\n {2}"report_type"/);
    expect(serializeSanitizedForwardingReport(report)).toBe(text);
  });
});

describe("buildSanitizedForwardingReport — degraded input coercion (regression)", () => {
  it("coerces non-finite numbers and non-string errors safely", () => {
    const report = buildSanitizedForwardingReport({
      status: status({
        // @ts-expect-error intentional garbage input from a degraded listener
        retry_count: "3",
        max_retry_attempts: Number.NaN,
        // @ts-expect-error intentional garbage
        last_forward_error: 404,
        // @ts-expect-error intentional garbage
        last_forward_status: "200",
      }),
      nowIso: NOW_ISO,
    });
    expect(report.bridge_status.retry_count).toBe(0);
    expect(report.bridge_status.max_retry_attempts).toBe(0);
    expect(report.bridge_status.last_forward_error).toBeNull();
    expect(report.bridge_status.last_forward_status).toBeNull();
  });

  it("drops non-finite metric values from the error-report path", () => {
    const report = buildSanitizedForwardingReport({
      status: status(),
      errorReport: {
        latest_metrics: {
          captured_at: "2026-08-27T11:56:00.000Z",
          source: "live",
          vendor: "ecowitt",
          metrics: {
            temp_f: Number.NaN,
            humidity_percent: "55" as unknown as number,
            soil_moisture_pct: 40,
          },
        },
      },
      nowIso: NOW_ISO,
    });
    expect(report.latest_metrics.metrics).toEqual({ soil_moisture_pct: 40 });
  });

  it("is deterministic for identical inputs with injected nowIso", () => {
    const a = buildSanitizedForwardingReport({ status: status(), nowIso: NOW_ISO });
    const b = buildSanitizedForwardingReport({ status: status(), nowIso: NOW_ISO });
    expect(a).toEqual(b);
  });
});

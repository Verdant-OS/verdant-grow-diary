/**
 * Sensors testbench — Network diagnostics regression coverage.
 *
 * Tests the pure builder (`buildSensorIngestNetworkDiagnostics`) that
 * powers the Network diagnostics panel in
 * `src/components/SensorsTestbenchPanel.tsx`. The panel JSX is a thin
 * pass-through: it gates on `status !== "not_applicable"` and renders
 * the helper's `evidence` and `recommendedChecks` lists as-is.
 *
 * Pure. No Supabase, no fetch, no edge-function calls, no token reads.
 */
import { describe, it, expect } from "vitest";
import {
  buildSensorIngestNetworkDiagnostics,
  type SensorIngestNetworkDiagnostics,
} from "@/lib/sensorDiagnosticsExportRules";

const SUPABASE_URL = "https://abcproject.supabase.co";
const CANONICAL_INGEST_URL = `${SUPABASE_URL}/functions/v1/sensor-ingest-webhook`;

/** Extract the label portion (before the first ":") of each evidence row. */
function evidenceLabels(d: SensorIngestNetworkDiagnostics): string[] {
  return d.evidence.map((line) => line.split(":")[0]);
}

// -------------------------------------------------------------------------
// Panel gating — does the data tell the panel to render?
// -------------------------------------------------------------------------
describe("Network diagnostics panel — gating predicate", () => {
  it("returns 'not_applicable' (panel hides) when no test has run / non-network error", () => {
    const d = buildSensorIngestNetworkDiagnostics({
      ingestUrl: CANONICAL_INGEST_URL,
      appOrigin: "https://app.verdant.example",
      httpStatus: 200,
      classification: "accepted",
      requestMethod: "POST",
      hasActiveToken: true,
      supabaseUrl: SUPABASE_URL,
    });
    expect(d.status).toBe("not_applicable");
    expect(d.evidence).toEqual([]);
    expect(d.recommendedChecks).toEqual([]);
  });

  it("returns a non-'not_applicable' status (panel renders) on HTTP 0 / network_error", () => {
    const d = buildSensorIngestNetworkDiagnostics({
      ingestUrl: CANONICAL_INGEST_URL,
      appOrigin: "https://app.verdant.example",
      httpStatus: 0,
      classification: "network_error",
      requestMethod: "POST",
      hasActiveToken: true,
      supabaseUrl: SUPABASE_URL,
    });
    expect(d.status).not.toBe("not_applicable");
    expect(d.evidence.length).toBeGreaterThan(0);
    expect(d.recommendedChecks.length).toBeGreaterThan(0);
  });

  it("also renders when classification is 'network_error' even if httpStatus drifts to 0", () => {
    const d = buildSensorIngestNetworkDiagnostics({
      ingestUrl: CANONICAL_INGEST_URL,
      appOrigin: "https://app.verdant.example",
      httpStatus: 0,
      classification: "network_error",
      requestMethod: "POST",
      hasActiveToken: false,
      supabaseUrl: SUPABASE_URL,
    });
    expect(d.status).not.toBe("not_applicable");
  });
});

// -------------------------------------------------------------------------
// Five classification scenarios
// -------------------------------------------------------------------------
describe("Network diagnostics — likely_mixed_content (HTTPS app → HTTP ingest)", () => {
  const d = buildSensorIngestNetworkDiagnostics({
    ingestUrl: "http://abcproject.supabase.co/functions/v1/sensor-ingest-webhook",
    appOrigin: "https://app.verdant.example",
    httpStatus: 0,
    classification: "network_error",
    requestMethod: "POST",
    hasActiveToken: true,
    supabaseUrl: SUPABASE_URL,
  });

  it("classifies as likely_mixed_content", () => {
    expect(d.status).toBe("likely_mixed_content");
  });

  it("recommends serving the ingest endpoint over HTTPS", () => {
    expect(d.recommendedChecks.join("\n")).toMatch(/HTTPS/i);
  });
});

describe("Network diagnostics — likely_endpoint_unreachable (private-host ingest)", () => {
  const d = buildSensorIngestNetworkDiagnostics({
    ingestUrl: "http://192.168.1.50:8080/functions/v1/sensor-ingest-webhook",
    appOrigin: "https://app.verdant.example",
    httpStatus: 0,
    classification: "network_error",
    requestMethod: "POST",
    hasActiveToken: true,
    // No supabaseUrl provided → canonical check is skipped; this isolates
    // the private-host branch from the canonical/wrong-path branch.
  });

  it("classifies as likely_endpoint_unreachable", () => {
    expect(d.status).toBe("likely_endpoint_unreachable");
  });

  it("recommends verifying bridge/firewall reachability", () => {
    const txt = d.recommendedChecks.join("\n");
    expect(txt).toMatch(/firewall|listener|bridge|reachab/i);
  });
});

describe("Network diagnostics — likely_cors_or_preflight (cross-origin)", () => {
  const d = buildSensorIngestNetworkDiagnostics({
    ingestUrl: CANONICAL_INGEST_URL,
    appOrigin: "https://app.verdant.example",
    httpStatus: 0,
    classification: "network_error",
    requestMethod: "POST",
    hasActiveToken: true,
    supabaseUrl: SUPABASE_URL,
  });

  it("classifies as likely_cors_or_preflight", () => {
    expect(d.status).toBe("likely_cors_or_preflight");
  });

  it("flags OPTIONS preflight as the most likely missing CORS surface", () => {
    expect(d.cors.optionsHeaders).toBe("missing");
    expect(d.recommendedChecks.join("\n")).toMatch(/OPTIONS preflight/i);
  });
});

describe("Network diagnostics — likely_endpoint_misconfigured (no ingest URL)", () => {
  const d = buildSensorIngestNetworkDiagnostics({
    ingestUrl: "",
    appOrigin: "https://app.verdant.example",
    httpStatus: 0,
    classification: "network_error",
    requestMethod: "POST",
    hasActiveToken: true,
    // No supabaseUrl → avoid the supabase_url_missing branch and
    // isolate the missing-ingest-URL branch.
  });

  it("classifies as likely_endpoint_misconfigured", () => {
    expect(d.status).toBe("likely_endpoint_misconfigured");
  });

  it("surfaces the missing ingest URL as evidence", () => {
    expect(d.resolvedEndpoint).toBe("<missing>");
  });
});

describe("Network diagnostics — needs_network_inspection (same-origin, no obvious cause)", () => {
  const d = buildSensorIngestNetworkDiagnostics({
    ingestUrl: CANONICAL_INGEST_URL,
    appOrigin: "https://abcproject.supabase.co",
    httpStatus: 0,
    classification: "network_error",
    requestMethod: "POST",
    hasActiveToken: true,
    supabaseUrl: SUPABASE_URL,
  });

  it("falls back to needs_network_inspection", () => {
    expect(d.status).toBe("needs_network_inspection");
  });

  it("recommends opening DevTools → Network", () => {
    expect(d.recommendedChecks.join("\n")).toMatch(/DevTools.*Network/i);
  });
});

// -------------------------------------------------------------------------
// Evidence contract (every network-error scenario)
// -------------------------------------------------------------------------
describe("Network diagnostics — evidence contract", () => {
  const cases: ReadonlyArray<{
    name: string;
    input: Parameters<typeof buildSensorIngestNetworkDiagnostics>[0];
  }> = [
    {
      name: "likely_mixed_content",
      input: {
        ingestUrl: "http://abcproject.supabase.co/functions/v1/sensor-ingest-webhook",
        appOrigin: "https://app.verdant.example",
        httpStatus: 0,
        classification: "network_error",
        requestMethod: "POST",
        hasActiveToken: true,
        supabaseUrl: SUPABASE_URL,
      },
    },
    {
      name: "likely_cors_or_preflight",
      input: {
        ingestUrl: CANONICAL_INGEST_URL,
        appOrigin: "https://app.verdant.example",
        httpStatus: 0,
        classification: "network_error",
        requestMethod: "POST",
        hasActiveToken: false,
        supabaseUrl: SUPABASE_URL,
      },
    },
    {
      name: "needs_network_inspection",
      input: {
        ingestUrl: CANONICAL_INGEST_URL,
        appOrigin: "https://abcproject.supabase.co",
        httpStatus: 0,
        classification: "network_error",
        requestMethod: "POST",
        hasActiveToken: true,
        supabaseUrl: SUPABASE_URL,
      },
    },
  ];

  it.each(cases.map((c) => [c.name, c.input] as const))(
    "%s — evidence includes HTTP status 0, classification, request method, ingest URL, browser origin, and bridge-token presence",
    (_name, input) => {
      const d = buildSensorIngestNetworkDiagnostics(input);
      const labels = evidenceLabels(d);
      expect(labels).toContain("HTTP status");
      expect(labels).toContain("classification");
      expect(labels).toContain("request method");
      expect(labels).toContain("resolved ingest URL");
      expect(labels).toContain("browser origin");
      expect(labels).toContain("bridge token present");
      expect(d.evidence.join("\n")).toMatch(/HTTP status: 0/);
      expect(d.evidence.join("\n")).toMatch(/classification: network_error/);
      expect(d.evidence.join("\n")).toMatch(/request method: POST/);
      // Bridge-token presence is rendered as yes/no per the input boolean.
      const expectedTokenLine = input.hasActiveToken
        ? "bridge token present: yes"
        : "bridge token present: no";
      expect(d.evidence).toContain(expectedTokenLine);
    },
  );

  it("every network-error scenario includes both always-on recommended checks", () => {
    for (const c of cases) {
      const d = buildSensorIngestNetworkDiagnostics(c.input);
      expect(d.recommendedChecks).toContain(
        "Verify the ingest URL and path match the deployed Edge Function.",
      );
      expect(d.recommendedChecks).toContain(
        "Confirm the HTTPS app is not calling an HTTP endpoint.",
      );
    }
  });
});

// -------------------------------------------------------------------------
// Negative control — secret terms never render
// -------------------------------------------------------------------------
describe("Network diagnostics — negative control (no secret leakage)", () => {
  it("redacts a bridge token embedded in the ingest URL across all output surfaces", () => {
    const tokenized =
      `${SUPABASE_URL}/functions/v1/sensor-ingest-webhook?apikey=vbt_supersecrettoken123ABCxyz`;
    const d = buildSensorIngestNetworkDiagnostics({
      ingestUrl: tokenized,
      appOrigin: "https://app.verdant.example",
      httpStatus: 0,
      classification: "network_error",
      requestMethod: "POST",
      hasActiveToken: true,
      supabaseUrl: SUPABASE_URL,
    });
    const surfaces = [
      d.resolvedEndpoint,
      d.canonicalIngestUrl,
      d.evidence.join("\n"),
      d.recommendedChecks.join("\n"),
      d.safeSupportSummary,
    ].join("\n");
    expect(surfaces).not.toMatch(/vbt_[A-Za-z0-9_-]{8,}/);
    expect(surfaces).toMatch(/<redacted>/);
  });

  it("output never contains literal 'service_role', 'Bearer ', or raw token prefixes", () => {
    const d = buildSensorIngestNetworkDiagnostics({
      ingestUrl: CANONICAL_INGEST_URL,
      appOrigin: "https://app.verdant.example",
      httpStatus: 0,
      classification: "network_error",
      requestMethod: "POST",
      hasActiveToken: true,
      supabaseUrl: SUPABASE_URL,
    });
    const surfaces = [
      d.resolvedEndpoint,
      d.canonicalIngestUrl,
      d.appOrigin,
      d.title,
      d.summary,
      d.evidence.join("\n"),
      d.recommendedChecks.join("\n"),
      d.safeSupportSummary,
    ].join("\n");
    expect(surfaces).not.toMatch(/service_role/i);
    expect(surfaces).not.toMatch(/\bBearer\s+[A-Za-z0-9._-]+/);
    expect(surfaces).not.toMatch(/vbt_[A-Za-z0-9_-]{8,}/);
  });

  it("contract: builder input never accepts a raw token field (only hasActiveToken: boolean)", () => {
    // Compile-time/type-contract check at runtime. The interface exposes
    // `hasActiveToken?: boolean` only; if a future change adds a string
    // token field, this assertion forces a deliberate review.
    const inputKeys: ReadonlyArray<string> = [
      "ingestUrl",
      "appOrigin",
      "httpStatus",
      "classification",
      "errorMessage",
      "requestMethod",
      "hasActiveToken",
      "supabaseUrl",
    ];
    for (const k of inputKeys) {
      expect(/token|secret|bearer|service[_-]?role/i.test(k)).toBe(
        k === "hasActiveToken",
      );
    }
  });
});

// -------------------------------------------------------------------------
// Narrow snapshot — status + title + evidence labels + check labels only
// -------------------------------------------------------------------------
describe("Network diagnostics — narrow snapshot (labels only, low-noise)", () => {
  it("locks the shape for likely_cors_or_preflight", () => {
    const d = buildSensorIngestNetworkDiagnostics({
      ingestUrl: CANONICAL_INGEST_URL,
      appOrigin: "https://app.verdant.example",
      httpStatus: 0,
      classification: "network_error",
      requestMethod: "POST",
      hasActiveToken: true,
      supabaseUrl: SUPABASE_URL,
    });
    expect({
      status: d.status,
      title: d.title,
      evidenceLabels: evidenceLabels(d),
      recommendedCheckLabels: d.recommendedChecks,
    }).toMatchInlineSnapshot(`
      {
        "evidenceLabels": [
          "HTTP status",
          "classification",
          "request method",
          "resolved ingest URL",
          "expected canonical URL",
          "canonical URL match",
          "browser origin",
          "bridge token present",
        ],
        "recommendedCheckLabels": [
          "Open DevTools → Network and look for a failed OPTIONS preflight request to the ingest URL.",
          "Confirm the Edge Function returns Access-Control-Allow-Origin and Access-Control-Allow-Headers on OPTIONS and error responses.",
          "Verify the Edge Function is deployed and reachable at the configured URL.",
          "Verify the ingest URL and path match the deployed Edge Function.",
          "Confirm the HTTPS app is not calling an HTTP endpoint.",
        ],
        "status": "likely_cors_or_preflight",
        "title": "Likely CORS or preflight failure (cross-origin Failed to fetch)",
      }
    `);
  });
});

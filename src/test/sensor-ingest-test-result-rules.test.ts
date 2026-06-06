import { describe, expect, it } from "vitest";
import {
  buildEnvMatchChecklist,
  classifySensorIngestTestResult,
} from "@/lib/sensorIngestTestResultRules";

describe("classifySensorIngestTestResult", () => {
  it("network error flagged distinctly", () => {
    const r = classifySensorIngestTestResult({ status: 0, body: null, networkError: true });
    expect(r.category).toBe("network_error");
    expect(r.isSuccess).toBe(false);
  });

  it("2xx with inserted=1 → accepted", () => {
    const r = classifySensorIngestTestResult({
      status: 200,
      body: { ok: true, inserted: 1, rejected: [], auth: "bridge" },
    });
    expect(r.category).toBe("accepted");
    expect(r.isSuccess).toBe(true);
    expect(r.headline).toContain("200");
  });

  it("2xx with rejected items → accepted_with_rejections", () => {
    const r = classifySensorIngestTestResult({
      status: 200,
      body: { ok: true, inserted: 1, rejected: [{ metric: "ph", reason: "out_of_range" }] },
    });
    expect(r.category).toBe("accepted_with_rejections");
    expect(r.isSuccess).toBe(true);
  });

  it("401 → auth_problem and never success", () => {
    const r = classifySensorIngestTestResult({ status: 401, body: { error: "invalid_token" } });
    expect(r.category).toBe("auth_problem");
    expect(r.isSuccess).toBe(false);
  });

  it("403 → tent_token_mismatch", () => {
    const r = classifySensorIngestTestResult({ status: 403, body: {} });
    expect(r.category).toBe("tent_token_mismatch");
  });

  it("400 → payload_problem", () => {
    const r = classifySensorIngestTestResult({ status: 400, body: { error: "bad_source" } });
    expect(r.category).toBe("payload_problem");
    expect(r.detail).toContain("bad_source");
  });

  it("404 → wrong project / function missing", () => {
    const r = classifySensorIngestTestResult({ status: 404, body: null });
    expect(r.category).toBe("wrong_project_or_function_missing");
  });

  it("500 → server_error and not success", () => {
    const r = classifySensorIngestTestResult({ status: 500, body: null });
    expect(r.category).toBe("server_error");
    expect(r.isSuccess).toBe(false);
  });

  it("never rewrites a non-2xx as success", () => {
    for (const s of [401, 403, 400, 404, 429, 500, 502, 503]) {
      const r = classifySensorIngestTestResult({ status: s, body: null });
      expect(r.isSuccess).toBe(false);
    }
  });
});

describe("buildEnvMatchChecklist", () => {
  it("all green when everything matches and ingest seen", () => {
    const items = buildEnvMatchChecklist({
      supabaseUrl: "https://abc.supabase.co",
      ingestUrl: "https://abc.supabase.co/functions/v1/sensor-ingest-webhook",
      tentId: "tent-1",
      hasActiveToken: true,
      tokenTentScoped: true,
      lastIngestAtIso: "2026-06-06T00:00:00Z",
    });
    expect(items.every((i) => i.ok)).toBe(true);
  });

  it("flags endpoint mismatch when origin differs", () => {
    const items = buildEnvMatchChecklist({
      supabaseUrl: "https://abc.supabase.co",
      ingestUrl: "https://xyz.supabase.co/functions/v1/sensor-ingest-webhook",
      tentId: "tent-1",
      hasActiveToken: true,
      tokenTentScoped: true,
      lastIngestAtIso: null,
    });
    expect(items.find((i) => i.key === "ingest_url")?.ok).toBe(false);
    expect(items.find((i) => i.key === "ingest_seen")?.ok).toBe(false);
  });

  it("flags missing tent and missing token", () => {
    const items = buildEnvMatchChecklist({
      supabaseUrl: "https://abc.supabase.co",
      ingestUrl: "https://abc.supabase.co/functions/v1/sensor-ingest-webhook",
      tentId: null,
      hasActiveToken: false,
      tokenTentScoped: false,
      lastIngestAtIso: null,
    });
    expect(items.find((i) => i.key === "tent_selected")?.ok).toBe(false);
    expect(items.find((i) => i.key === "token_present")?.ok).toBe(false);
    expect(items.find((i) => i.key === "token_tent_scoped")?.ok).toBe(false);
  });
});

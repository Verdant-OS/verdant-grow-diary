/**
 * Tests — AI Doctor 2.0 confidence Edge Function client.
 *
 * No real network. fetch is injected via options.fetchImpl.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calculateConfidenceViaEdgeFunction,
  CONSERVATIVE_FALLBACK,
} from "../lib/aiDoctorConfidenceEdgeClient";

const URL_BASE = "https://example.supabase.co";
const TOKEN = "user-jwt-abc";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const input = {
  context: { tent: "t" },
  visual_observations: { summary: "v" },
  model_output: { summary: "m" },
  version: "ai-doctor-engine@0.1.0",
};

describe("aiDoctorConfidenceEdgeClient", () => {
  it("calls correct Edge Function URL with Bearer user JWT and payload", async () => {
    const fetchImpl = vi.fn(async (_url: any, _init: any) =>
      jsonResponse({ score: 72, level: "Medium", explanation: "ok" }),
    );
    const result = await calculateConfidenceViaEdgeFunction(input, {
      accessToken: TOKEN,
      supabaseUrl: URL_BASE,
      fetchImpl: fetchImpl as any,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${URL_BASE}/functions/v1/calculate-confidence`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      context: input.context,
      visual_observations: input.visual_observations,
      model_output: input.model_output,
      version: input.version,
    });
    expect(result).toEqual({ score: 72, level: "Medium", explanation: "ok" });
  });

  it("clamps score above 100 down to 100", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ score: 9999, level: "High", explanation: "x" }),
    );
    const r = await calculateConfidenceViaEdgeFunction(input, {
      accessToken: TOKEN,
      supabaseUrl: URL_BASE,
      fetchImpl: fetchImpl as any,
    });
    expect(r.score).toBe(100);
  });

  it("clamps score below 0 up to 0", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ score: -50, level: "Low", explanation: "x" }),
    );
    const r = await calculateConfidenceViaEdgeFunction(input, {
      accessToken: TOKEN,
      supabaseUrl: URL_BASE,
      fetchImpl: fetchImpl as any,
    });
    expect(r.score).toBe(0);
  });

  it("invalid response shape returns fallback Low", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ nope: true }));
    const r = await calculateConfidenceViaEdgeFunction(input, {
      accessToken: TOKEN,
      supabaseUrl: URL_BASE,
      fetchImpl: fetchImpl as any,
    });
    expect(r).toEqual(CONSERVATIVE_FALLBACK);
  });

  it("network error returns fallback Low", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    });
    const r = await calculateConfidenceViaEdgeFunction(input, {
      accessToken: TOKEN,
      supabaseUrl: URL_BASE,
      fetchImpl: fetchImpl as any,
    });
    expect(r).toEqual(CONSERVATIVE_FALLBACK);
  });

  it("non-2xx response returns fallback Low", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ score: 90, level: "High" }, 500));
    const r = await calculateConfidenceViaEdgeFunction(input, {
      accessToken: TOKEN,
      supabaseUrl: URL_BASE,
      fetchImpl: fetchImpl as any,
    });
    expect(r).toEqual(CONSERVATIVE_FALLBACK);
  });

  it("missing access token returns fallback Low and never calls fetch", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const r = await calculateConfidenceViaEdgeFunction(input, {
      accessToken: null,
      supabaseUrl: URL_BASE,
      fetchImpl: fetchImpl as any,
    });
    expect(r).toEqual(CONSERVATIVE_FALLBACK);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("preserves conflicts_detected when returned", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        score: 55,
        level: "Medium",
        explanation: "mixed signals",
        conflicts_detected: ["vpd_stale", "photo_low_light"],
      }),
    );
    const r = await calculateConfidenceViaEdgeFunction(input, {
      accessToken: TOKEN,
      supabaseUrl: URL_BASE,
      fetchImpl: fetchImpl as any,
    });
    expect(r.conflicts_detected).toEqual(["vpd_stale", "photo_low_light"]);
  });

  it("source file contains no service_role or bridge token strings", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/aiDoctorConfidenceEdgeClient.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/bridge[_-]?token/i);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

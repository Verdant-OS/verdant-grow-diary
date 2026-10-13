/**
 * Regression coverage for the Gemini-direct review threads on #1982:
 * inline coach photos, the doctor HMAC frame, and Gemini 429 quota refunds.
 * HMAC and quota cases call the handlers and the signing helper. The inline
 * photo cases still read the coach source for the URL fence and execute the
 * download helper.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lookupGeminiDirectRoute } from "../../supabase/functions/_shared/geminiDirectChat.ts";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const COACH = read("supabase/functions/ai-coach/index.ts");

const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SPEND_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IDEMPOTENCY_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HMAC_SECRET = "0123456789abcdef0123456789abcdef";

type RpcCall = { name: string; params?: Record<string, unknown> };

async function loadDoctor() {
  const specifier = "../../supabase/functions/ai-doctor-review/index.ts";
  return import(/* @vite-ignore */ specifier);
}

async function loadCoach() {
  const specifier = "../../supabase/functions/ai-coach/index.ts";
  return import(/* @vite-ignore */ specifier);
}

function installDenoEnv(values: Record<string, string>): () => void {
  const host = globalThis as { Deno?: { env: { get(name: string): string | undefined } } };
  const previous = host.Deno;
  host.Deno = {
    env: {
      get(name: string) {
        return values[name];
      },
    },
  };
  return () => {
    host.Deno = previous;
  };
}

function createFakeClient(calls: RpcCall[], feature: string) {
  return () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: USER_ID } } }),
    },
    rpc: (name: string, params?: Record<string, unknown>) => {
      calls.push({ name, params });
      if (name === "ai_credit_spend") {
        return Promise.resolve({
          data: {
            ok: true,
            status: "spent",
            spend_id: SPEND_ID,
            feature,
            model_tier: "standard",
            grow_id: null,
          },
          error: null,
        });
      }
      if (name === "ai_credit_refund") {
        return Promise.resolve({ data: { ok: true, status: "refunded" }, error: null });
      }
      if (name === "ai_doctor_finalize_review") {
        return Promise.resolve({ data: { ok: true, status: "recorded" }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "unexpected rpc" } });
    },
    from: () => {
      throw new Error("table read was not expected");
    },
  });
}

function doctorPacket() {
  return {
    schemaVersion: 1,
    plant: { strain: "Northern Lights", stage: "flower", medium: "coco", potSize: "11 L" },
    readiness: { state: "strong", evidence: ["sensor-snapshot"], missing: [] },
    recentEvents: [],
    recentSensorSnapshot: {
      capturedAt: "2026-09-25T12:05:00.000Z",
      severity: "ok",
      readings: [{ field: "humidity_pct", value: 50, unit: "%" }],
    },
    recentSensorSnapshotAnnotation: {
      line: "[source=manual, trust=medium] humidity_pct=50 %",
      source: "manual",
      stale: false,
      trust: "medium",
      includesValues: true,
      safetyNotes: [],
      missingInformationHints: [],
    },
  };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

async function loadInline() {
  // The helper is absent until the fix. A literal import() is resolved by
  // Vite before any assertion runs, which hides the source-scan failures.
  const specifier = "../../supabase/functions/_shared/geminiInlineImage.ts";
  return import(/* @vite-ignore */ specifier);
}

describe("AI Doctor HMAC frame version", () => {
  it("signs the resolved v2 frame with the wire model", async () => {
    const { buildAiDoctorSigningFrame, signAiDoctorPrompt } = await loadDoctor();
    const route = lookupGeminiDirectRoute("ai_doctor_review", "standard");
    expect(route.ok).toBe(true);
    if (!route.ok) return;
    const prompt = {
      system: "system text",
      user: "user text",
      guidance: [],
      importedHistoryBlock: null,
      missingLiveReadingsBlock: null,
    };
    const frame = buildAiDoctorSigningFrame(prompt);
    const parsed = JSON.parse(frame) as { version: string; model: string };
    expect(parsed.version).toBe("ai-doctor-review-prompt-v2");
    expect(parsed.model).toBe(route.geminiModelId);
    expect(parsed.model).not.toBe(route.recordedModelId);
    const signed = await signAiDoctorPrompt(prompt, HMAC_SECRET);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(HMAC_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(frame));
    const hex = Array.from(new Uint8Array(signature), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    expect(signed).toBe(`hmac-sha256:${hex}`);
    const v1 = frame.replace("ai-doctor-review-prompt-v2", "ai-doctor-review-prompt-v1");
    const v1Signature = await crypto.subtle.sign("HMAC", key, encoder.encode(v1));
    const v1Hex = Array.from(new Uint8Array(v1Signature), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    expect(signed).not.toBe(`hmac-sha256:${v1Hex}`);
  });

  it("finalizes a successful review with the real HMAC and v2 contract", async () => {
    const { handleAiDoctorReviewRequest } = await loadDoctor();
    const calls: RpcCall[] = [];
    const restoreEnv = installDenoEnv({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      PAYMENTS_ENVIRONMENT: "live",
      GEMINI_API_KEY: "test-gemini-key-not-a-secret",
      AI_DOCTOR_RECEIPT_HMAC_KEY: HMAC_SECRET,
      AI_DOCTOR_RECEIPT_HMAC_KEY_ID: "test-key",
    });
    const review = {
      summary: "The available context supports a cautious observation-only review.",
      likely_issue: "A possible stress pattern needs follow-up evidence.",
      confidence: "medium",
      evidence: ["Humidity is 50 percent in the current snapshot."],
      missing_information: [],
      possible_causes: ["Normal variation remains possible."],
      immediate_action: "Observe the plant and add a follow-up note if its condition changes.",
      what_not_to_do: "Do not make abrupt equipment changes from this review.",
      twenty_four_hour_follow_up:
        "Recheck the plant and record any visible change within 24 hours.",
      three_day_recovery_plan:
        "Keep observations consistent and review the trend after three days.",
      risk_level: "watch",
    };
    const capturedBodies: string[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (
        url === "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" &&
        typeof init?.body === "string"
      ) {
        capturedBodies.push(init.body);
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [{ function: { arguments: JSON.stringify(review) } }],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const response = await handleAiDoctorReviewRequest(
        new Request("https://project.supabase.co/functions/v1/ai-doctor-review", {
          method: "POST",
          headers: {
            Authorization: "Bearer test-jwt",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            packet: doctorPacket(),
            idempotencyKey: IDEMPOTENCY_KEY,
          }),
        }),
        { createClient: createFakeClient(calls, "ai_doctor_review") },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok?: boolean; reason?: string };
      expect(body.ok).toBe(true);
      const finalized = calls.filter((call) => call.name === "ai_doctor_finalize_review");
      expect(finalized).toHaveLength(1);
      expect(capturedBodies).toHaveLength(1);
      const outbound = JSON.parse(capturedBodies[0] ?? "") as {
        model?: unknown;
        messages?: unknown;
        tools?: unknown;
        tool_choice?: unknown;
      };
      const frame = JSON.stringify({
        version: "ai-doctor-review-prompt-v2",
        model: outbound.model,
        messages: outbound.messages,
        tools: outbound.tools,
        tool_choice: outbound.tool_choice,
      });
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(HMAC_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(frame));
      const hex = Array.from(new Uint8Array(signature), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      expect(finalized[0]?.params?.p_prompt_hmac_sha256).toBe(`hmac-sha256:${hex}`);
      expect(finalized[0]?.params?.p_prompt_contract_version).toBe("ai-doctor-review-prompt-v2");
    } finally {
      globalThis.fetch = previous;
      restoreEnv();
    }
  });
});

describe("Gemini 429 quota outcome", () => {
  it("AI Doctor maps an injected 429 to a confirmed upstream_429 refund", async () => {
    const { handleAiDoctorReviewRequest } = await loadDoctor();
    const calls: RpcCall[] = [];
    const restoreEnv = installDenoEnv({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      PAYMENTS_ENVIRONMENT: "live",
      GEMINI_API_KEY: "test-gemini-key-not-a-secret",
      AI_DOCTOR_RECEIPT_HMAC_KEY: HMAC_SECRET,
      AI_DOCTOR_RECEIPT_HMAC_KEY_ID: "test-key",
    });
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => new Response("quota", { status: 429 })) as typeof fetch;
    try {
      const response = await handleAiDoctorReviewRequest(
        new Request("https://project.supabase.co/functions/v1/ai-doctor-review", {
          method: "POST",
          headers: {
            Authorization: "Bearer test-jwt",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            packet: doctorPacket(),
            idempotencyKey: IDEMPOTENCY_KEY,
          }),
        }),
        { createClient: createFakeClient(calls, "ai_doctor_review") },
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        reason: "upstream_credit_exhausted",
      });
      const refunds = calls.filter((call) => call.name === "ai_credit_refund");
      expect(refunds).toHaveLength(1);
      expect(refunds[0]?.params).toMatchObject({
        p_expected_user_id: USER_ID,
        p_spend_id: SPEND_ID,
        p_idempotency_key: `refund:${SPEND_ID}`,
        p_reason: "upstream_429",
      });
    } finally {
      globalThis.fetch = previous;
      restoreEnv();
    }
  });

  it("AI Coach maps an injected 429 to a confirmed upstream_429 refund", async () => {
    const { handleAiCoachRequest } = await loadCoach();
    const calls: RpcCall[] = [];
    const supabaseUrl = "https://project.supabase.co";
    const photoUrl = `${supabaseUrl}/storage/v1/object/sign/diary-photos/leaf.jpg?token=t`;
    const restoreEnv = installDenoEnv({
      SUPABASE_URL: supabaseUrl,
      SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      PAYMENTS_ENVIRONMENT: "live",
      GEMINI_API_KEY: "test-gemini-key-not-a-secret",
    });
    const previous = globalThis.fetch;
    const storageUrls: string[] = [];
    const geminiBodies: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const parsed = new URL(url);
      if (
        parsed.origin === "https://generativelanguage.googleapis.com" &&
        parsed.pathname === "/v1beta/openai/chat/completions"
      ) {
        geminiBodies.push(typeof init?.body === "string" ? init.body : "");
        return new Response("quota", { status: 429 });
      }
      storageUrls.push(url);
      if (url !== photoUrl) return new Response("missing", { status: 404 });
      return new Response(JPEG, { status: 200 });
    }) as typeof fetch;
    try {
      const response = await handleAiCoachRequest(
        new Request("https://project.supabase.co/functions/v1/ai-coach", {
          method: "POST",
          headers: {
            Authorization: "Bearer test-jwt",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "diagnose",
            idempotencyKey: IDEMPOTENCY_KEY,
            photoUrl,
          }),
        }),
        { createClient: createFakeClient(calls, "ai_coach") },
      );
      expect(storageUrls).toEqual([photoUrl]);
      const storage = new URL(storageUrls[0] ?? "");
      expect(storage.origin).toBe("https://project.supabase.co");
      expect(storage.pathname).toBe("/storage/v1/object/sign/diary-photos/leaf.jpg");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        reason: "upstream_credit_exhausted",
      });
      const refunds = calls.filter((call) => call.name === "ai_credit_refund");
      expect(refunds).toHaveLength(1);
      expect(refunds[0]?.params).toMatchObject({
        p_reason: "upstream_429",
      });
      expect(geminiBodies).toHaveLength(1);
      const payload = JSON.parse(geminiBodies[0] ?? "{}") as {
        messages?: Array<{ role?: string; content?: Array<Record<string, unknown>> }>;
      };
      const user = payload.messages?.find((message) => message.role === "user");
      const image = user?.content?.find((part) => part.type === "image_url") as
        { image_url?: { url?: string } } | undefined;
      const jpegDataUrl = `data:image/jpeg;base64,${btoa(String.fromCharCode(...JPEG))}`;
      expect(image?.image_url?.url).toBe(jpegDataUrl);
      expect(geminiBodies[0]).not.toContain(photoUrl);
    } finally {
      globalThis.fetch = previous;
      restoreEnv();
    }
  });
});

describe("AI Coach inline photos", () => {
  it("does not place the signed storage URL in the Gemini image part", () => {
    expect(COACH).not.toContain("url: body.photoUrl");
    expect(COACH).toContain("downloadSignedStorageObject(");
    expect(COACH).toContain("buildGeminiInlineImagePart(");
    expect(COACH.match(/fetch\(\s*["'`]https?:/g) ?? []).toEqual([]);
    expect(COACH.match(/fetch\(GATEWAY_URL/g) ?? []).toHaveLength(1);
  });

  it("turns jpeg, png, gif, and webp bytes into a data URL", async () => {
    const { buildGeminiInlineImagePart } = await loadInline();
    const cases = [
      [JPEG, "image/jpeg"],
      [PNG, "image/png"],
      [GIF, "image/gif"],
      [WEBP, "image/webp"],
    ] as const;
    for (const [bytes, mime] of cases) {
      const built = buildGeminiInlineImagePart(bytes);
      expect(built.ok).toBe(true);
      if (!built.ok) continue;
      expect(built.part.type).toBe("image_url");
      expect(built.part.image_url.url.startsWith(`data:${mime};base64,`)).toBe(true);
      expect(built.part.image_url.url).not.toContain("https://");
    }
  });

  it("rejects empty, oversized, and non-image bytes", async () => {
    const { buildGeminiInlineImagePart, GEMINI_INLINE_IMAGE_MAX_BYTES } = await loadInline();
    expect(GEMINI_INLINE_IMAGE_MAX_BYTES).toBe(7 * 1024 * 1024);
    expect(buildGeminiInlineImagePart(new Uint8Array())).toEqual({ ok: false, reason: "empty" });
    expect(buildGeminiInlineImagePart(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
    const over = new Uint8Array(5);
    over.set(JPEG);
    expect(buildGeminiInlineImagePart(over, 4)).toEqual({ ok: false, reason: "too_large" });
  });

  it("downloads only an allowed signed storage URL and returns the bytes", async () => {
    const { downloadSignedStorageObject } = await loadInline();
    const prefix = "https://project.supabase.co/storage/v1/object/sign/";
    const photoUrl = `${prefix}diary-photos/leaf.jpg?token=signed-secret`;
    let calls = 0;
    const downloaded = await downloadSignedStorageObject({
      photoUrl,
      allowedPrefix: prefix,
      fetchImpl: async (input, init) => {
        calls += 1;
        expect(String(input)).toBe(photoUrl);
        expect(init?.redirect).toBe("error");
        return new Response(JPEG, {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        });
      },
    });
    expect(calls).toBe(1);
    expect(downloaded).toEqual({ ok: true, bytes: JPEG });
  });

  it("does not fetch a URL outside the signed storage prefix", async () => {
    const { downloadSignedStorageObject } = await loadInline();
    let calls = 0;
    const downloaded = await downloadSignedStorageObject({
      photoUrl: "https://evil.example/storage/v1/object/sign/leaf.jpg?token=signed-secret",
      allowedPrefix: "https://project.supabase.co/storage/v1/object/sign/",
      fetchImpl: async () => {
        calls += 1;
        return new Response(JPEG);
      },
    });
    expect(calls).toBe(0);
    expect(downloaded).toEqual({ ok: false, reason: "rejected_url" });
  });

  it("stops when the object is larger than the inline bound", async () => {
    const { downloadSignedStorageObject } = await loadInline();
    const prefix = "https://project.supabase.co/storage/v1/object/sign/";
    const downloaded = await downloadSignedStorageObject({
      photoUrl: `${prefix}diary-photos/leaf.jpg?token=signed-secret`,
      allowedPrefix: prefix,
      maxBytes: 4,
      fetchImpl: async () =>
        new Response(new Uint8Array(8), {
          status: 200,
          headers: { "content-length": "8" },
        }),
    });
    expect(downloaded).toEqual({ ok: false, reason: "too_large" });
  });

  it("treats a redirect or a failed download as download_failed", async () => {
    const { downloadSignedStorageObject } = await loadInline();
    const prefix = "https://project.supabase.co/storage/v1/object/sign/";
    const photoUrl = `${prefix}diary-photos/leaf.jpg?token=signed-secret`;
    const redirected = await downloadSignedStorageObject({
      photoUrl,
      allowedPrefix: prefix,
      fetchImpl: async () => new Response(null, { status: 302 }),
    });
    expect(redirected).toEqual({ ok: false, reason: "download_failed" });
    const thrown = await downloadSignedStorageObject({
      photoUrl,
      allowedPrefix: prefix,
      fetchImpl: async () => {
        throw new Error("redirect");
      },
    });
    expect(thrown).toEqual({ ok: false, reason: "download_failed" });
  });
});

/**
 * Regression coverage for the Gemini-direct review threads on #1982:
 * inline coach photos, version the doctor HMAC frame, and map Gemini 429
 * to the existing quota outcome. These tests import the new helper and
 * read the two function sources. They do not edit locked pins.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const DOCTOR = read("supabase/functions/ai-doctor-review/index.ts");
const COACH = read("supabase/functions/ai-coach/index.ts");

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
  it("signs new receipts as prompt contract v2 while p_model_id stays the gateway id", () => {
    expect(DOCTOR).toContain('const PROMPT_CONTRACT_VERSION = "ai-doctor-review-prompt-v2"');
    expect(DOCTOR).toContain("version: PROMPT_CONTRACT_VERSION");
    expect(DOCTOR).toContain("model: WIRE_MODEL");
    expect(DOCTOR).toContain("p_model_id: MODEL");
    expect(DOCTOR).toContain("p_prompt_contract_version: PROMPT_CONTRACT_VERSION");
    expect(DOCTOR).not.toMatch(/const PROMPT_CONTRACT_VERSION = "ai-doctor-review-prompt-v1"/);
  });
});

describe("Gemini 429 quota outcome", () => {
  it("AI Doctor maps 429 to upstream_credit_exhausted before the generic http failure", () => {
    const quota = DOCTOR.indexOf("upstream.status === 429");
    const generic = DOCTOR.indexOf("if (!upstream.ok)");
    expect(quota).toBeGreaterThan(-1);
    expect(generic).toBeGreaterThan(quota);
    const block = DOCTOR.slice(quota, generic);
    expect(block).toContain(
      'failureAfterRefund(spendId, "upstream_429", "upstream_credit_exhausted")',
    );
    expect(block).toContain("ai-doctor-review status=upstream_credit_exhausted");
  });

  it("AI Coach maps 429 to upstream_credit_exhausted and no longer treats it as http", () => {
    const quota = COACH.indexOf("r.status === 429");
    const payment = COACH.indexOf("r.status === 402", quota);
    expect(quota).toBeGreaterThan(-1);
    expect(payment).toBeGreaterThan(quota);
    const block = COACH.slice(quota, payment);
    expect(block).toContain(
      'failureAfterRefund(spendId, "upstream_429", "upstream_credit_exhausted")',
    );
    expect(block).not.toContain('"http"');
    expect(block).toContain("ai-coach status=upstream_credit_exhausted http=200");
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

/**
 * Bounds for the signed coach photo download on #1982.
 * The normalized pathname must stay under the signed-object prefix, and an
 * abort signal must stop the download after a credit spend. This file is new;
 * locked coach pins stay untouched.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { downloadSignedStorageObject } from "../../supabase/functions/_shared/geminiInlineImage.ts";

const ROOT = resolve(__dirname, "../..");
const COACH = readFileSync(resolve(ROOT, "supabase/functions/ai-coach/index.ts"), "utf8");

const PREFIX = "https://project.supabase.co/storage/v1/object/sign/";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);

const BYPASS: Array<[string, string]> = [
  ["a parent segment", `${PREFIX}../public/leaf.jpg?token=t`],
  ["a percent-encoded parent segment", `${PREFIX}%2e%2e/public/leaf.jpg?token=t`],
  ["an uppercase percent-encoded parent segment", `${PREFIX}%2E%2E/public/leaf.jpg?token=t`],
  ["a nested parent segment", `${PREFIX}foo/../../public/leaf.jpg?token=t`],
  [
    "encoded parents under a bucket folder",
    `${PREFIX}diary-photos/%2e%2e/%2e%2e/public/leaf.jpg?token=t`,
  ],
  ["a backslash parent segment", `${PREFIX}..\\public/leaf.jpg?token=t`],
];

describe("signed photo pathname", () => {
  it.each(BYPASS)("rejects %s before fetch", async (_label, photoUrl) => {
    let calls = 0;
    const downloaded = await downloadSignedStorageObject({
      photoUrl,
      allowedPrefix: PREFIX,
      fetchImpl: async () => {
        calls += 1;
        return new Response(JPEG, { status: 200 });
      },
    });
    expect(calls).toBe(0);
    expect(downloaded).toEqual({ ok: false, reason: "rejected_url" });
  });

  it("downloads a normal signed object once", async () => {
    const photoUrl = `${PREFIX}diary-photos/leaf.jpg?token=signed-secret`;
    let calls = 0;
    const downloaded = await downloadSignedStorageObject({
      photoUrl,
      allowedPrefix: PREFIX,
      fetchImpl: async (input) => {
        calls += 1;
        expect(String(input)).toBe(photoUrl);
        return new Response(JPEG, { status: 200 });
      },
    });
    expect(calls).toBe(1);
    expect(downloaded).toEqual({ ok: true, bytes: JPEG });
  });

  it("downloads when the signed token contains dot segments", async () => {
    const photoUrl = `${PREFIX}diary-photos/leaf.jpg?token=ab..cd`;
    let calls = 0;
    const downloaded = await downloadSignedStorageObject({
      photoUrl,
      allowedPrefix: PREFIX,
      fetchImpl: async () => {
        calls += 1;
        return new Response(JPEG, { status: 200 });
      },
    });
    expect(calls).toBe(1);
    expect(downloaded).toEqual({ ok: true, bytes: JPEG });
  });

  it("downloads when an encoded slash stays inside the signed path", async () => {
    const urls = [
      `${PREFIX}..%2Fpublic/leaf.jpg?token=t`,
      `${PREFIX}%2e%2e%2fpublic/leaf.jpg?token=t`,
    ];
    for (const photoUrl of urls) {
      let calls = 0;
      const downloaded = await downloadSignedStorageObject({
        photoUrl,
        allowedPrefix: PREFIX,
        fetchImpl: async () => {
          calls += 1;
          return new Response(JPEG, { status: 200 });
        },
      });
      expect(calls).toBe(1);
      expect(downloaded).toEqual({ ok: true, bytes: JPEG });
    }
  });
});

describe("signed photo download deadline", () => {
  it("does not fetch when the signal is already aborted", async () => {
    const photoUrl = `${PREFIX}diary-photos/leaf.jpg?token=signed-secret`;
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const downloaded = await downloadSignedStorageObject({
      photoUrl,
      allowedPrefix: PREFIX,
      signal: controller.signal,
      fetchImpl: async () => {
        calls += 1;
        return new Response(JPEG, { status: 200 });
      },
    });
    expect(calls).toBe(0);
    expect(downloaded).toEqual({ ok: false, reason: "download_failed" });
  });

  it("forwards the abort signal on the storage fetch", async () => {
    const photoUrl = `${PREFIX}diary-photos/leaf.jpg?token=signed-secret`;
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    await downloadSignedStorageObject({
      photoUrl,
      allowedPrefix: PREFIX,
      signal: controller.signal,
      fetchImpl: async (_input, init) => {
        seen = init?.signal ?? undefined;
        return new Response(JPEG, { status: 200 });
      },
    });
    expect(seen).toBe(controller.signal);
  });

  it("arms the coach photo deadline before the provider timer", () => {
    const regionStart = COACH.indexOf("if (body.photoUrl)");
    const providerAt = COACH.indexOf("const providerController = new AbortController();");
    expect(regionStart).toBeGreaterThan(-1);
    expect(providerAt).toBeGreaterThan(regionStart);
    const region = COACH.slice(regionStart, providerAt);
    const downloadAt = region.indexOf("await downloadSignedStorageObject(");
    expect(downloadAt).toBeGreaterThan(-1);
    expect(region).toContain("signal:");
    expect(region.indexOf("PROVIDER_TIMEOUT_MS")).toBeGreaterThan(-1);
    expect(region.indexOf("PROVIDER_TIMEOUT_MS")).toBeLessThan(downloadAt);
  });
});

describe("coach photo parser", () => {
  it("checks the parsed pathname and keeps the signed-object prefix literal", () => {
    const parser = COACH.indexOf("function parseAiCoachBody");
    const parsedBody = COACH.indexOf("const body = parseAiCoachBody");
    expect(parser).toBeGreaterThan(-1);
    expect(parsedBody).toBeGreaterThan(parser);
    const block = COACH.slice(parser, parsedBody);
    expect(block).toContain("/storage/v1/object/sign/");
    expect(block).toContain("isAllowedSignedPhotoUrl(");
  });
});

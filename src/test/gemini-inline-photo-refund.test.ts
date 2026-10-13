/**
 * Refund path for a signed coach photo download that fails after the credit
 * spend. A rejected body cancel, an in-flight abort, and a stalled body must
 * all resolve as download_failed so the coach refund runs. This file is new.
 */
import { describe, expect, it } from "vitest";
import { downloadSignedStorageObject } from "../../supabase/functions/_shared/geminiInlineImage.ts";

const PREFIX = "https://project.supabase.co/storage/v1/object/sign/";
const PHOTO_URL = `${PREFIX}diary-photos/leaf.jpg?token=t`;

describe("signed photo refund after a failed download", () => {
  it("refunds when cancelling a failed response is rejected", async () => {
    const downloaded = await downloadSignedStorageObject({
      photoUrl: PHOTO_URL,
      allowedPrefix: PREFIX,
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            pull() {
              return new Promise(() => undefined);
            },
            cancel() {
              return Promise.reject(new Error("cancel refused"));
            },
          }),
          { status: 500 },
        ),
    });
    expect(downloaded).toEqual({ ok: false, reason: "download_failed" });
  });

  it("refunds when the in-flight fetch aborts", async () => {
    const controller = new AbortController();
    const downloaded = await downloadSignedStorageObject({
      photoUrl: PHOTO_URL,
      allowedPrefix: PREFIX,
      signal: controller.signal,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("no signal"));
            return;
          }
          const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
          if (signal.aborted) {
            abort();
            return;
          }
          signal.addEventListener("abort", abort, { once: true });
          setTimeout(() => controller.abort(), 15);
        }),
    });
    expect(downloaded).toEqual({ ok: false, reason: "download_failed" });
  });

  it("refunds when the response body stalls until abort", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15);
    try {
      const downloaded = await downloadSignedStorageObject({
        photoUrl: PHOTO_URL,
        allowedPrefix: PREFIX,
        signal: controller.signal,
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              pull() {
                return new Promise(() => undefined);
              },
            }),
            { status: 200 },
          ),
      });
      expect(downloaded).toEqual({ ok: false, reason: "download_failed" });
    } finally {
      clearTimeout(timer);
    }
  });
});

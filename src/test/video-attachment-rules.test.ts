import { describe, it, expect } from "vitest";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  VIDEO_MAX_DURATION_S,
  VIDEO_MAX_SIZE_BYTES,
  isAllowedVideoMime,
  isWithinVideoDurationCap,
  isWithinVideoSizeCap,
  precheckVideoAttachment,
  validateVideoAttachment,
} from "@/lib/videoAttachmentRules";

describe("videoAttachmentRules", () => {
  it("allows only the three approved MIME types", () => {
    for (const m of ALLOWED_VIDEO_MIME_TYPES) expect(isAllowedVideoMime(m)).toBe(true);
    expect(isAllowedVideoMime("image/jpeg")).toBe(false);
    expect(isAllowedVideoMime("video/avi")).toBe(false);
    expect(isAllowedVideoMime("")).toBe(false);
    expect(isAllowedVideoMime(null)).toBe(false);
  });

  it("enforces the 100 MB size cap", () => {
    expect(isWithinVideoSizeCap(1)).toBe(true);
    expect(isWithinVideoSizeCap(VIDEO_MAX_SIZE_BYTES)).toBe(true);
    expect(isWithinVideoSizeCap(VIDEO_MAX_SIZE_BYTES + 1)).toBe(false);
    expect(isWithinVideoSizeCap(0)).toBe(false);
    expect(isWithinVideoSizeCap(-5)).toBe(false);
  });

  it("enforces the 60-second duration cap", () => {
    expect(isWithinVideoDurationCap(1)).toBe(true);
    expect(isWithinVideoDurationCap(VIDEO_MAX_DURATION_S)).toBe(true);
    expect(isWithinVideoDurationCap(VIDEO_MAX_DURATION_S + 0.1)).toBe(false);
    expect(isWithinVideoDurationCap(0)).toBe(false);
    expect(isWithinVideoDurationCap(NaN)).toBe(false);
  });

  it("rejects empty / wrong-mime / oversize files in precheck", () => {
    expect(precheckVideoAttachment(null).ok).toBe(false);
    expect(precheckVideoAttachment({ type: "video/mp4", size: 0 } as never).ok).toBe(false);
    const wrong = precheckVideoAttachment({ type: "image/png", size: 100 } as never);
    if (wrong.ok === false) expect(wrong.reason).toBe("mime_not_allowed");
    else throw new Error("expected rejection");
    const big = precheckVideoAttachment({
      type: "video/mp4",
      size: VIDEO_MAX_SIZE_BYTES + 1,
    } as never);
    if (big.ok === false) expect(big.reason).toBe("size_exceeded");
    else throw new Error("expected rejection");
    expect(precheckVideoAttachment({ type: "video/mp4", size: 1024 } as never).ok).toBe(true);
  });

  it("validateVideoAttachment rejects duration overflow and unreadable files", async () => {
    const file = { type: "video/mp4", size: 1024 } as never;
    const long = await validateVideoAttachment(file, async () => ({ ok: true, durationS: 90 }));
    if (long.ok === false) expect(long.reason).toBe("duration_exceeded");
    else throw new Error("expected duration rejection");

    const bad = await validateVideoAttachment(file, async () => ({ ok: false }));
    if (bad.ok === false) expect(bad.reason).toBe("unreadable");
    else throw new Error("expected unreadable rejection");

    const threw = await validateVideoAttachment(file, async () => {
      throw new Error("boom");
    });
    if (threw.ok === false) expect(threw.reason).toBe("unreadable");
    else throw new Error("expected throw rejection");

    const good = await validateVideoAttachment(file, async () => ({ ok: true, durationS: 12 }));
    if (good.ok === true) {
      expect(good.durationS).toBe(12);
      expect(good.mime).toBe("video/mp4");
      expect(good.sizeBytes).toBe(1024);
    } else {
      throw new Error("expected ok result");
    }
  });
});

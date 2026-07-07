/**
 * diary-videos bucket server-side config contract.
 *
 * Documents the required server-side settings for the `diary-videos`
 * storage bucket and pins them against the client-side enforcement in
 * `videoAttachmentRules.ts`. The bucket config itself is applied via
 * the backend console (tooling here cannot write `storage.buckets`),
 * so this test acts as a repo-level regression fence: if a future
 * change loosens the client rules, this test fails and forces a
 * matching review of the bucket-side allow-list.
 *
 * Safety:
 *  - No I/O, no network, no Supabase calls.
 *  - Does not assert live bucket state; only pins the required contract.
 */

import { describe, it, expect } from "vitest";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  VIDEO_MAX_SIZE_BYTES,
} from "@/lib/videoAttachmentRules";

/**
 * Server-side settings that MUST be configured on the private
 * `diary-videos` bucket via the backend console:
 *
 *   - File size limit: 104857600 bytes (100 MB)
 *   - Allowed MIME types: video/mp4, video/quicktime, video/webm
 *   - Public: false
 *
 * Owner-scoped storage.objects RLS policies remain intact.
 * `diary-photos` is not modified by this contract.
 */
const REQUIRED_DIARY_VIDEOS_BUCKET_CONFIG = {
  name: "diary-videos",
  public: false,
  fileSizeLimitBytes: 104_857_600,
  allowedMimeTypes: ["video/mp4", "video/quicktime", "video/webm"] as const,
} as const;

describe("diary-videos bucket server-side config contract", () => {
  it("declares a private bucket", () => {
    expect(REQUIRED_DIARY_VIDEOS_BUCKET_CONFIG.public).toBe(false);
  });

  it("pins the 100 MB file size limit to the client-side cap", () => {
    expect(REQUIRED_DIARY_VIDEOS_BUCKET_CONFIG.fileSizeLimitBytes).toBe(
      100 * 1024 * 1024,
    );
    expect(REQUIRED_DIARY_VIDEOS_BUCKET_CONFIG.fileSizeLimitBytes).toBe(
      VIDEO_MAX_SIZE_BYTES,
    );
  });

  it("pins the allowed MIME allow-list to the client-side allow-list", () => {
    const server = [...REQUIRED_DIARY_VIDEOS_BUCKET_CONFIG.allowedMimeTypes]
      .map((m) => m.toLowerCase())
      .sort();
    const client = [...ALLOWED_VIDEO_MIME_TYPES]
      .map((m) => m.toLowerCase())
      .sort();
    expect(server).toEqual(client);
  });

  it("only whitelists MP4 / QuickTime / WebM", () => {
    expect([...REQUIRED_DIARY_VIDEOS_BUCKET_CONFIG.allowedMimeTypes].sort()).toEqual(
      ["video/mp4", "video/quicktime", "video/webm"],
    );
  });

  it("targets the diary-videos bucket, not diary-photos", () => {
    expect(REQUIRED_DIARY_VIDEOS_BUCKET_CONFIG.name).toBe("diary-videos");
    expect(REQUIRED_DIARY_VIDEOS_BUCKET_CONFIG.name).not.toBe("diary-photos");
  });
});

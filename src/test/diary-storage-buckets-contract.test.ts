/**
 * Storage safety contract for `diary-photos` and `diary-videos` buckets.
 *
 * Tooling in this workspace cannot mutate `storage.buckets` (SQL writes
 * are rejected with `bucket_sql_blocked`), so the server-side bucket
 * settings live in the backend console. This test acts as the repo-level
 * regression fence: it pins the *required* privacy + size + MIME contract
 * for both diary buckets, and ties each declaration to the client-side
 * rules where they exist.
 *
 * If a future change loosens the client rules, or someone edits this
 * contract, the mismatch fails CI and forces a matching backend review.
 *
 * Safety:
 *  - No I/O, no network, no Supabase calls.
 *  - Does not read live bucket state; only pins the required contract.
 *  - No `sensor_readings`, Action Queue, AI, or device changes.
 */

import { describe, it, expect } from "vitest";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  VIDEO_MAX_SIZE_BYTES,
} from "@/lib/videoAttachmentRules";

// ---------------------------------------------------------------------------
// Contract declarations — these must match backend console configuration.
// ---------------------------------------------------------------------------

const DIARY_VIDEOS_CONTRACT = {
  name: "diary-videos",
  public: false,
  fileSizeLimitBytes: 104_857_600, // 100 MB
  allowedMimeTypes: ["video/mp4", "video/quicktime", "video/webm"] as const,
  ownerScopedRls: true,
} as const;

/**
 * Photos accept the full HTML `image/*` family in the picker; there is
 * intentionally no client-side size cap (server enforces).
 *
 * The MIME allow-list below is the *server-side* whitelist we require
 * on the bucket — narrower than `image/*` on purpose to reject
 * `image/svg+xml` (script vector) and exotic types the client picker
 * would otherwise allow through.
 */
const DIARY_PHOTOS_CONTRACT = {
  name: "diary-photos",
  public: false,
  fileSizeLimitBytes: 26_214_400, // 25 MB — well above phone HEIC/JPEG norms
  allowedMimeTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ] as const,
  ownerScopedRls: true,
} as const;

const ALL_CONTRACTS = [DIARY_VIDEOS_CONTRACT, DIARY_PHOTOS_CONTRACT] as const;

// ---------------------------------------------------------------------------
// Bucket-agnostic invariants
// ---------------------------------------------------------------------------

describe("diary storage buckets — shared safety invariants", () => {
  it.each(ALL_CONTRACTS)(
    "$name must be private (owner-scoped, not public)",
    (bucket) => {
      expect(bucket.public).toBe(false);
    },
  );

  it.each(ALL_CONTRACTS)(
    "$name must declare a finite positive file_size_limit",
    (bucket) => {
      expect(Number.isFinite(bucket.fileSizeLimitBytes)).toBe(true);
      expect(bucket.fileSizeLimitBytes).toBeGreaterThan(0);
    },
  );

  it.each(ALL_CONTRACTS)(
    "$name must declare a non-empty allowed_mime_types allow-list",
    (bucket) => {
      expect(bucket.allowedMimeTypes.length).toBeGreaterThan(0);
      for (const m of bucket.allowedMimeTypes) {
        expect(m).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/);
      }
    },
  );

  it.each(ALL_CONTRACTS)(
    "$name must be owner-scoped via storage.objects RLS",
    (bucket) => {
      expect(bucket.ownerScopedRls).toBe(true);
    },
  );

  it("bucket names never collide", () => {
    const names = ALL_CONTRACTS.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ---------------------------------------------------------------------------
// diary-videos — pinned to client rules
// ---------------------------------------------------------------------------

describe("diary-videos server-side contract", () => {
  it("pins 100 MB size cap to VIDEO_MAX_SIZE_BYTES", () => {
    expect(DIARY_VIDEOS_CONTRACT.fileSizeLimitBytes).toBe(100 * 1024 * 1024);
    expect(DIARY_VIDEOS_CONTRACT.fileSizeLimitBytes).toBe(VIDEO_MAX_SIZE_BYTES);
  });

  it("pins MIME allow-list to ALLOWED_VIDEO_MIME_TYPES", () => {
    const server = [...DIARY_VIDEOS_CONTRACT.allowedMimeTypes]
      .map((m) => m.toLowerCase())
      .sort();
    const client = [...ALLOWED_VIDEO_MIME_TYPES]
      .map((m) => m.toLowerCase())
      .sort();
    expect(server).toEqual(client);
  });

  it("only whitelists MP4 / QuickTime / WebM", () => {
    expect([...DIARY_VIDEOS_CONTRACT.allowedMimeTypes].sort()).toEqual([
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ]);
  });

  it("rejects any non-video MIME in the allow-list", () => {
    for (const m of DIARY_VIDEOS_CONTRACT.allowedMimeTypes) {
      expect(m.startsWith("video/")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// diary-photos — server-side hardening
// ---------------------------------------------------------------------------

describe("diary-photos server-side contract", () => {
  it("caps upload size at 25 MB", () => {
    expect(DIARY_PHOTOS_CONTRACT.fileSizeLimitBytes).toBe(25 * 1024 * 1024);
  });

  it("rejects any non-image MIME in the allow-list", () => {
    for (const m of DIARY_PHOTOS_CONTRACT.allowedMimeTypes) {
      expect(m.startsWith("image/")).toBe(true);
    }
  });

  it("must NOT allow image/svg+xml (script vector)", () => {
    expect(DIARY_PHOTOS_CONTRACT.allowedMimeTypes as readonly string[]).not.toContain(
      "image/svg+xml",
    );
  });

  it("must NOT allow any video/* MIME (photos are photo-only)", () => {
    for (const m of DIARY_PHOTOS_CONTRACT.allowedMimeTypes) {
      expect(m.startsWith("video/")).toBe(false);
    }
  });

  it("supports common phone camera formats", () => {
    const allow = new Set(DIARY_PHOTOS_CONTRACT.allowedMimeTypes as readonly string[]);
    expect(allow.has("image/jpeg")).toBe(true);
    expect(allow.has("image/png")).toBe(true);
    expect(allow.has("image/heic")).toBe(true);
  });
});

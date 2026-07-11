/**
 * plantProfilePhotoStorageRules — pure helpers for building and
 * validating durable, private-storage references to plant profile
 * photos.
 *
 * Contract (V1):
 *   storage://diary-photos/<user-id>/<grow-id|unassigned>/plant-profiles/<plant-id>/<file>
 *
 *  - Only the `diary-photos` private bucket is allowed.
 *  - The first path segment MUST be the authenticated user id (owner
 *    guard). This is validated at parse time when a viewer user id is
 *    supplied and again by RLS on `storage.objects`.
 *  - Storage object paths must NEVER be surfaced in user-facing UI
 *    strings.
 *
 * No I/O. No fetch, no supabase, no crypto side effects beyond
 * `crypto.randomUUID` in the pure builder.
 */

export const PLANT_PROFILE_PHOTO_BUCKET = "diary-photos" as const;
export const PLANT_PROFILE_PHOTO_SCHEME = "storage://" as const;
export const PLANT_PROFILE_PHOTO_UNASSIGNED_GROW = "unassigned" as const;
export const PLANT_PROFILE_PHOTO_SUBFOLDER = "plant-profiles" as const;

export type PlantProfilePhotoStorageBucket = typeof PLANT_PROFILE_PHOTO_BUCKET;

export type PlantProfilePhotoReference =
  | { kind: "clear" }
  | { kind: "external"; url: string }
  | { kind: "data"; url: string }
  | { kind: "preview"; url: string /* blob: — never persisted */ }
  | {
      kind: "storage";
      bucket: PlantProfilePhotoStorageBucket;
      path: string;
    }
  | { kind: "invalid"; reason: string };

const MAX_URL_LEN = 2048;
const MAX_PATH_LEN = 1024;

function hasControlChars(input: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(input);
}

function isValidPathSegment(seg: string): boolean {
  if (!seg) return false;
  if (seg === "." || seg === "..") return false;
  if (seg.includes("\\")) return false;
  if (hasControlChars(seg)) return false;
  return true;
}

/**
 * Parse arbitrary persisted `plants.photo_url` values into a typed
 * reference. Never throws. Legacy http(s)/data URLs are preserved as
 * `external` / `data` so existing plants keep rendering.
 *
 * When `viewerUserId` is supplied, storage references whose first path
 * segment does not match are returned as `invalid` (`wrong-owner`).
 * The `reason` string is intended for logging only, not UI.
 */
export function parsePlantProfilePhotoReference(
  raw: unknown,
  opts: { viewerUserId?: string | null } = {},
): PlantProfilePhotoReference {
  if (typeof raw !== "string") return { kind: "clear" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: "clear" };
  if (trimmed.length > MAX_URL_LEN) {
    return { kind: "invalid", reason: "too-long" };
  }
  if (hasControlChars(trimmed)) {
    return { kind: "invalid", reason: "control-chars" };
  }

  if (trimmed.startsWith(PLANT_PROFILE_PHOTO_SCHEME)) {
    const rest = trimmed.slice(PLANT_PROFILE_PHOTO_SCHEME.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return { kind: "invalid", reason: "malformed" };
    const bucket = rest.slice(0, slash);
    const path = rest.slice(slash + 1);
    if (bucket !== PLANT_PROFILE_PHOTO_BUCKET) {
      return { kind: "invalid", reason: "unknown-bucket" };
    }
    if (!path || path.length > MAX_PATH_LEN) {
      return { kind: "invalid", reason: "malformed" };
    }
    if (path.startsWith("/")) {
      return { kind: "invalid", reason: "leading-slash" };
    }
    if (path.includes("?") || path.includes("#")) {
      return { kind: "invalid", reason: "malformed" };
    }
    const segs = path.split("/");
    for (const seg of segs) {
      if (!isValidPathSegment(seg)) {
        return { kind: "invalid", reason: "malformed" };
      }
    }
    if (opts.viewerUserId != null && segs[0] !== opts.viewerUserId) {
      return { kind: "invalid", reason: "wrong-owner" };
    }
    return { kind: "storage", bucket: PLANT_PROFILE_PHOTO_BUCKET, path };
  }

  if (/^data:image\/(png|jpe?g|webp|gif|avif);/i.test(trimmed)) {
    return { kind: "data", url: trimmed };
  }
  if (trimmed.startsWith("blob:")) {
    return { kind: "preview", url: trimmed };
  }
  try {
    const u = new URL(trimmed);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return { kind: "external", url: trimmed };
    }
    return { kind: "invalid", reason: "unsupported-protocol" };
  } catch {
    return { kind: "invalid", reason: "invalid-url" };
  }
}

export function formatPlantProfilePhotoStorageReference(
  bucket: PlantProfilePhotoStorageBucket,
  path: string,
): string {
  return `${PLANT_PROFILE_PHOTO_SCHEME}${bucket}/${path}`;
}

export interface BuildPlantProfilePhotoObjectPathInput {
  userId: string;
  growId: string | null | undefined;
  plantId: string;
  extension: string;
  /** Optional injectable id generator (tests). */
  randomId?: () => string;
}

function safeRandomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Fallback (older test envs): time + Math.random. Not cryptographic;
  // only reached when crypto.randomUUID is unavailable.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build a fresh, collision-resistant object path for a plant profile
 * photo. The first segment is always the authenticated user id so it
 * lines up with the owner-scoped RLS policy on `storage.objects`.
 * The original filename is intentionally NOT used.
 */
export function buildPlantProfilePhotoObjectPath(
  input: BuildPlantProfilePhotoObjectPathInput,
): string {
  const { userId, plantId, extension } = input;
  if (!userId || !isValidPathSegment(userId)) {
    throw new Error("buildPlantProfilePhotoObjectPath: invalid userId");
  }
  if (!plantId || !isValidPathSegment(plantId)) {
    throw new Error("buildPlantProfilePhotoObjectPath: invalid plantId");
  }
  const growSeg =
    input.growId && isValidPathSegment(input.growId)
      ? input.growId
      : PLANT_PROFILE_PHOTO_UNASSIGNED_GROW;
  const ext = extension.replace(/^\.+/, "").toLowerCase();
  const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error("buildPlantProfilePhotoObjectPath: invalid extension");
  }
  const id = (input.randomId ?? safeRandomId)();
  if (!id || !isValidPathSegment(id)) {
    throw new Error("buildPlantProfilePhotoObjectPath: invalid random id");
  }
  return `${userId}/${growSeg}/${PLANT_PROFILE_PHOTO_SUBFOLDER}/${plantId}/${id}.${ext}`;
}

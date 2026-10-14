/**
 * AI Coach photo intake bounds.
 *
 * Plant-profile photos may be 25 MB HEIC/HEIF. Coach inline Gemini
 * processing accepts at most 7 MiB and only JPEG, PNG, WEBP, and GIF.
 * Reject the gap here, before Storage upload and before credit spend.
 * No I/O beyond reading the file header the picker already holds.
 */

import {
  validatePlantProfilePhotoFile,
  type PlantProfilePhotoFileLike,
  type PlantProfilePhotoFileValidationFail,
  type PlantProfilePhotoMime,
} from "@/lib/plantProfilePhotoFileRules";

/** Matches GEMINI_INLINE_IMAGE_MAX_BYTES. Reject only when size is greater. */
export const AI_COACH_INLINE_PHOTO_MAX_BYTES = 7 * 1024 * 1024;

const COACH_REJECTED_MIME = new Set(["image/heic", "image/heif"]);

/**
 * ISO BMFF brands for HEIC and HEIF. A file labelled image/jpeg can
 * carry one of these as the ftyp major brand or as a compatible brand.
 */
const HEIF_FTYP_BRANDS = new Set([
  "heic",
  "heif",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

/** Bound for one ftyp box. Compatible brands sit after the 16-byte prefix. */
const FTYP_HEADER_READ_CAP = 256;

const TOO_LARGE_MESSAGE = "Choose a photo smaller than 7 MB.";
const UNSUPPORTED_MESSAGE = "That file type is not supported.";
const EMPTY_MESSAGE = "The selected file is empty.";

export type AiCoachPhotoMime = PlantProfilePhotoMime | "image/gif";

export type AiCoachPhotoFileValidation =
  | { ok: true; mime: AiCoachPhotoMime; extension: string; size: number }
  | PlantProfilePhotoFileValidationFail;

type HeaderFile = PlantProfilePhotoFileLike & {
  slice?: (start?: number, end?: number) => Blob;
};

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

function isHeifFtyp(bytes: Uint8Array, fileSize: number): boolean {
  if (bytes.length < 12) return false;
  if (ascii(bytes, 4, 4) !== "ftyp") return false;
  if (HEIF_FTYP_BRANDS.has(ascii(bytes, 8, 4).toLowerCase())) return true;
  const declared = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  // Size 1 is the 64-bit largesize flag. Its brand fields are not at these offsets.
  if (declared === 1) return true;
  // Size 0 means the box runs to EOF. Reject unless this read holds the whole file.
  const exceedsRead = declared === 0 ? fileSize > bytes.length : declared > bytes.length;
  if (exceedsRead) return true;
  const end = declared === 0 ? bytes.length : declared;
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    if (HEIF_FTYP_BRANDS.has(ascii(bytes, offset, 4).toLowerCase())) return true;
  }
  return false;
}

function isGifSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false;
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  return signature === "GIF87a" || signature === "GIF89a";
}

async function readHeader(file: HeaderFile): Promise<Uint8Array | null> {
  if (typeof file.slice !== "function") return null;
  const blob = file.slice(0, FTYP_HEADER_READ_CAP);
  const readable = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof readable.arrayBuffer === "function") {
    try {
      return new Uint8Array(await readable.arrayBuffer());
    } catch {
      return null;
    }
  }
  if (typeof FileReader === "undefined") return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result instanceof ArrayBuffer ? new Uint8Array(reader.result) : null);
    };
    reader.onerror = () => resolve(null);
    try {
      reader.readAsArrayBuffer(blob);
    } catch {
      resolve(null);
    }
  });
}

export async function validateAiCoachPhotoFile(
  file: HeaderFile | null | undefined,
): Promise<AiCoachPhotoFileValidation> {
  if (!file) {
    return { ok: false, reason: "empty", message: EMPTY_MESSAGE };
  }

  const declared = typeof file.type === "string" ? file.type.trim().toLowerCase() : "";
  if (declared === "image/gif") {
    if (typeof file.size !== "number" || file.size <= 0) {
      return { ok: false, reason: "empty", message: EMPTY_MESSAGE };
    }
    if (file.size > AI_COACH_INLINE_PHOTO_MAX_BYTES) {
      return { ok: false, reason: "too-large", message: TOO_LARGE_MESSAGE };
    }
    const header = await readHeader(file);
    if (!header || !isGifSignature(header) || isHeifFtyp(header, file.size)) {
      return { ok: false, reason: "unsupported-type", message: UNSUPPORTED_MESSAGE };
    }
    return { ok: true, mime: "image/gif", extension: "gif", size: file.size };
  }

  const validated = validatePlantProfilePhotoFile(file);
  if (!validated.ok) {
    if (validated.reason === "too-large") {
      return { ok: false, reason: "too-large", message: TOO_LARGE_MESSAGE };
    }
    return validated;
  }
  if (COACH_REJECTED_MIME.has(validated.mime)) {
    return { ok: false, reason: "unsupported-type", message: UNSUPPORTED_MESSAGE };
  }
  if (validated.size > AI_COACH_INLINE_PHOTO_MAX_BYTES) {
    return { ok: false, reason: "too-large", message: TOO_LARGE_MESSAGE };
  }
  const header = await readHeader(file);
  if (!header || isHeifFtyp(header, file.size)) {
    return { ok: false, reason: "unsupported-type", message: UNSUPPORTED_MESSAGE };
  }
  return validated;
}

// Inline image parts for Gemini's OpenAI-compatible chat endpoint.
//
// A signed Supabase HTTPS URL is not a Gemini image input. The OpenAI-compatible
// API accepts image_url values as base64 data URLs; an external HTTPS image_url
// is rejected. Callers download the already-validated storage object here and
// send bounded bytes. This module does not log the signed URL or its token.

export const GEMINI_INLINE_IMAGE_MAX_BYTES = 7 * 1024 * 1024;

const BASE64_CHUNK = 0x8000;

export type GeminiInlineImageReason = "empty" | "too_large" | "unsupported_type";

export type GeminiInlineImagePart = {
  type: "image_url";
  image_url: { url: string };
};

export type GeminiInlineImageResult =
  { ok: true; part: GeminiInlineImagePart } | { ok: false; reason: GeminiInlineImageReason };

export type GeminiSignedDownloadReason = "rejected_url" | "download_failed" | "too_large";

export type GeminiSignedDownloadResult =
  { ok: true; bytes: Uint8Array } | { ok: false; reason: GeminiSignedDownloadReason };

export type GeminiInlineFetch = (input: string, init?: RequestInit) => Promise<Response>;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    const slice = bytes.subarray(offset, offset + BASE64_CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 6) {
    const signature = String.fromCharCode(...bytes.subarray(0, 6));
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function buildGeminiInlineImagePart(
  bytes: Uint8Array,
  maxBytes: number = GEMINI_INLINE_IMAGE_MAX_BYTES,
): GeminiInlineImageResult {
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  if (bytes.byteLength > maxBytes) return { ok: false, reason: "too_large" };
  const mime = sniffImageMime(bytes);
  if (!mime) return { ok: false, reason: "unsupported_type" };
  return {
    ok: true,
    part: {
      type: "image_url",
      image_url: { url: `data:${mime};base64,${bytesToBase64(bytes)}` },
    },
  };
}

function isAllowedSignedPhotoUrl(photoUrl: string, allowedPrefix: string): boolean {
  let photo: URL;
  let prefix: URL;
  try {
    photo = new URL(photoUrl);
    prefix = new URL(allowedPrefix);
  } catch {
    return false;
  }
  if (photo.protocol !== "https:" || prefix.protocol !== "https:") return false;
  if (photo.username !== "" || photo.password !== "") return false;
  if (photo.origin !== prefix.origin) return false;
  return photoUrl.startsWith(allowedPrefix);
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<GeminiSignedDownloadResult> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isFinite(length) || length < 0 || length > maxBytes) {
      await response.body?.cancel();
      return { ok: false, reason: "too_large" };
    }
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const buffered = new Uint8Array(await response.arrayBuffer());
    if (buffered.byteLength > maxBytes) return { ok: false, reason: "too_large" };
    return { ok: true, bytes: buffered };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, reason: "too_large" };
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

export async function downloadSignedStorageObject(args: {
  photoUrl: string;
  allowedPrefix: string;
  fetchImpl?: GeminiInlineFetch;
  maxBytes?: number;
}): Promise<GeminiSignedDownloadResult> {
  if (!isAllowedSignedPhotoUrl(args.photoUrl, args.allowedPrefix)) {
    return { ok: false, reason: "rejected_url" };
  }
  const maxBytes = args.maxBytes ?? GEMINI_INLINE_IMAGE_MAX_BYTES;
  const fetchImpl = args.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(args.photoUrl, { redirect: "error" });
  } catch {
    return { ok: false, reason: "download_failed" };
  }
  if (!response.ok) {
    await response.body?.cancel();
    return { ok: false, reason: "download_failed" };
  }
  try {
    return await readBoundedBody(response, maxBytes);
  } catch {
    return { ok: false, reason: "download_failed" };
  }
}

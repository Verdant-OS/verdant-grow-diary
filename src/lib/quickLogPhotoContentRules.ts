/**
 * Quick Log photo content check. A renamed extension or a browser MIME
 * taken from the name is not enough: a .png claim must start with the
 * PNG signature.
 */

export const QUICK_LOG_FAKE_PNG_MESSAGE =
  "That file isn't a PNG image. Choose a real photo." as const;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function fileClaimsPng(file: { name?: string | null; type?: string | null }): boolean {
  const name = (file.name ?? "").trim().toLowerCase();
  const type = (file.type ?? "").trim().toLowerCase();
  return name.endsWith(".png") || type === "image/png";
}

export function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

async function readHeader(file: Blob, length: number): Promise<Uint8Array | null> {
  const blob = file.slice(0, length);
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

/**
 * Some in-memory blobs already hold their bytes (jsdom's file impl). A
 * same-turn Save, as the plant photo fixtures do, has to see the signature
 * decision before the change handler returns. Browsers without that buffer
 * stay on the async read.
 */
function inMemoryBytes(file: Blob): Uint8Array | null {
  for (const symbol of Object.getOwnPropertySymbols(file)) {
    const value = (file as unknown as Record<symbol, unknown>)[symbol];
    if (!value || typeof value !== "object" || !("_buffer" in value)) continue;
    const buffer = (value as { _buffer?: Uint8Array })._buffer;
    if (!buffer || typeof buffer.length !== "number" || typeof buffer.byteOffset !== "number") {
      continue;
    }
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
  }
  return null;
}

export function inspectQuickLogPngClaimNow(
  file: Blob & { name?: string | null; type?: string | null },
): { ok: true } | { ok: false; message: string } | null {
  if (!fileClaimsPng(file)) return { ok: true };
  const bytes = inMemoryBytes(file);
  if (!bytes) return null;
  if (!hasPngSignature(bytes.subarray(0, PNG_SIGNATURE.length))) {
    return { ok: false, message: QUICK_LOG_FAKE_PNG_MESSAGE };
  }
  return { ok: true };
}

export async function validateQuickLogPngClaim(
  file: Blob & { name?: string | null; type?: string | null },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!fileClaimsPng(file)) return { ok: true };
  const header = await readHeader(file, PNG_SIGNATURE.length);
  if (!header || !hasPngSignature(header)) {
    return { ok: false, message: QUICK_LOG_FAKE_PNG_MESSAGE };
  }
  return { ok: true };
}

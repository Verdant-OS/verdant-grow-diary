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

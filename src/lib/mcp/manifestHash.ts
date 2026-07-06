/**
 * Deterministic manifest fingerprint for the Agent Integrations UI.
 *
 * SAFETY:
 * - Hashes ONLY the presenter-safe manifest object (server metadata,
 *   tool names, tool descriptions, JSON-schema shapes).
 * - Never touches env values, runtime credentials, tokens, or secrets.
 * - Pure/deterministic: same input → same fingerprint, byte for byte.
 * - Sensitive to the manifest tool surface (adding/removing/renaming
 *   tools or parameters changes the hash).
 */
import type { MCPManifestView } from "./manifestView";

/** FNV-1a 32-bit hex hash. Non-cryptographic; identity only. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Stable JSON.stringify — object keys sorted, arrays preserved in order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/**
 * Presenter-safe subset of the manifest that participates in the
 * fingerprint. Intentionally excludes nothing sensitive because the
 * source manifest is already public metadata — but we still narrow to
 * a stable projection so unrelated additions don't churn the hash.
 */
function projectManifest(manifest: MCPManifestView) {
  return {
    serverName: manifest.serverName,
    version: manifest.version,
    sdkVersion: manifest.sdkVersion,
    path: manifest.path,
    tools: manifest.tools.map((t) => ({
      name: t.name,
      readOnly: t.readOnly,
      params: t.params.map((p) => ({
        name: p.name,
        type: p.type,
        required: p.required,
        constraints: p.constraints ?? null,
      })),
    })),
  };
}

export function computeManifestHash(manifest: MCPManifestView): string {
  return fnv1a(stableStringify(projectManifest(manifest)));
}

export function shortenManifestHash(hash: string): string {
  return hash.length > 10 ? `${hash.slice(0, 10)}…` : hash;
}

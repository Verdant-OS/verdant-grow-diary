/**
 * sensorHistoryImportReplayGuard — local-only duplicate/replay guard for
 * sensor history imports.
 *
 * Hard contract:
 *  - Local browser storage only. No network. No Supabase. No alerts.
 *    No Action Queue. No AI. No device control. No schema/RLS/Edge.
 *  - Stores only sanitized fingerprints (opaque 16-hex hashes) and a
 *    timestamp. Never stores raw_payload, raw rows, device serials,
 *    bridge tokens, source file names, internal IDs, or user_id.
 *  - Bounded ring buffer; corrupt storage resets safely.
 */

export const SENSOR_HISTORY_IMPORT_REPLAY_STORAGE_KEY =
  "verdant.sensorHistoryImportReplay.v1";

export const SENSOR_HISTORY_IMPORT_REPLAY_MAX_ENTRIES = 50;

export const SENSOR_HISTORY_IMPORT_DUPLICATE_COPY =
  "This appears to match a sensor history import already saved on this device." as const;

export interface SensorHistoryImportReplayEntry {
  fingerprint: string;
  recordedAt: string;
}

export interface ReplayGuardOptions {
  storage?: Storage | null;
  now?: () => Date;
}

function getStorage(opts?: ReplayGuardOptions): Storage | null {
  if (opts && Object.prototype.hasOwnProperty.call(opts, "storage")) {
    return opts.storage ?? null;
  }
  try {
    return typeof globalThis !== "undefined" &&
      (globalThis as { localStorage?: Storage }).localStorage
      ? (globalThis as { localStorage: Storage }).localStorage
      : null;
  } catch {
    return null;
  }
}

function isEntry(v: unknown): v is SensorHistoryImportReplayEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.fingerprint === "string" &&
    e.fingerprint.length > 0 &&
    typeof e.recordedAt === "string"
  );
}

export function readSensorHistoryImportReplayEntries(
  opts?: ReplayGuardOptions,
): SensorHistoryImportReplayEntry[] {
  const storage = getStorage(opts);
  if (!storage) return [];
  let raw: string | null = null;
  try {
    raw = storage.getItem(SENSOR_HISTORY_IMPORT_REPLAY_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      storage.removeItem(SENSOR_HISTORY_IMPORT_REPLAY_STORAGE_KEY);
    } catch {
      // ignore
    }
    return [];
  }
  if (!Array.isArray(parsed)) {
    try {
      storage.removeItem(SENSOR_HISTORY_IMPORT_REPLAY_STORAGE_KEY);
    } catch {
      // ignore
    }
    return [];
  }
  return parsed
    .filter(isEntry)
    .slice(-SENSOR_HISTORY_IMPORT_REPLAY_MAX_ENTRIES);
}

export function hasSensorHistoryImportFingerprint(
  fingerprint: string,
  opts?: ReplayGuardOptions,
): boolean {
  if (!fingerprint) return false;
  return readSensorHistoryImportReplayEntries(opts).some(
    (e) => e.fingerprint === fingerprint,
  );
}

export function recordSensorHistoryImportFingerprint(
  fingerprint: string,
  opts?: ReplayGuardOptions,
): SensorHistoryImportReplayEntry | null {
  if (!fingerprint || typeof fingerprint !== "string") return null;
  const storage = getStorage(opts);
  const now = (opts?.now ?? (() => new Date()))();
  const entry: SensorHistoryImportReplayEntry = {
    fingerprint,
    recordedAt: now.toISOString(),
  };
  if (!storage) return entry;
  const existing = readSensorHistoryImportReplayEntries(opts).filter(
    (e) => e.fingerprint !== fingerprint,
  );
  const next = [...existing, entry].slice(
    -SENSOR_HISTORY_IMPORT_REPLAY_MAX_ENTRIES,
  );
  try {
    storage.setItem(
      SENSOR_HISTORY_IMPORT_REPLAY_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // swallow quota/unavailable
  }
  return entry;
}

export function clearSensorHistoryImportReplayEntries(
  opts?: ReplayGuardOptions,
): void {
  const storage = getStorage(opts);
  if (!storage) return;
  try {
    storage.removeItem(SENSOR_HISTORY_IMPORT_REPLAY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

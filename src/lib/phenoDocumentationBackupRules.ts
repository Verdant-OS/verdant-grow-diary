/**
 * phenoDocumentationBackupRules — #552.
 *
 * Candidate documentation (6 sections, ~28 fields) is saved in this browser's
 * localStorage only. Rather than add schema, growers can download a versioned
 * JSON backup of their device-saved documentation and restore it on another
 * device or after clearing site data.
 *
 * The backup file is UNTRUSTED on restore: only known sections and fields are
 * kept, values must be strings (capped), record ids are restricted to a safe
 * charset, and the file never carries the user id (restore writes under the
 * signed-in user). Pure: no React, no storage access of its own, no clock.
 */

import {
  PHENO_DOCUMENTATION_DEFAULTS,
  mergeDocumentationValues,
  type PhenoDocumentationValues,
} from "@/constants/phenoDocumentationDefaults";

export type PhenoDocRecordType = "candidate" | "breeding_program";

const RECORD_TYPES: ReadonlySet<string> = new Set(["candidate", "breeding_program"]);

export const PHENO_DOC_BACKUP_FORMAT = "verdant.pheno-documentation-backup";
export const PHENO_DOC_BACKUP_VERSION = 1;
export const PHENO_DOC_BACKUP_MAX_RECORDS = 5000;
export const PHENO_DOC_BACKUP_MAX_FIELD_LENGTH = 10000;
/** Reject absurdly large files before parsing (bytes of text). */
export const PHENO_DOC_BACKUP_MAX_TEXT_LENGTH = 20_000_000;

const RECORD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * localStorage key for one record. USER-scoped when signed in; the legacy
 * device-scoped key is only used signed out and is never attributed to a user.
 */
export function phenoDocStorageKey(
  recordType: PhenoDocRecordType,
  recordId: string,
  userId: string | null,
): string {
  return userId
    ? `phenoDocs:${userId}:${recordType}:${recordId}`
    : `phenoDocs:${recordType}:${recordId}`;
}

export interface PhenoDocRecord {
  readonly recordType: PhenoDocRecordType;
  readonly recordId: string;
  readonly values: PhenoDocumentationValues;
}

export interface PhenoDocumentationBackup {
  readonly format: typeof PHENO_DOC_BACKUP_FORMAT;
  readonly version: typeof PHENO_DOC_BACKUP_VERSION;
  readonly exportedAt: string;
  readonly records: ReadonlyArray<PhenoDocRecord>;
}

export type PhenoDocBackupParseResult =
  | { readonly ok: true; readonly records: ReadonlyArray<PhenoDocRecord> }
  | {
      readonly ok: false;
      readonly reason:
        "not_json" | "too_large" | "wrong_format" | "unsupported_version" | "empty" | "too_many";
    };

export const PHENO_DOC_BACKUP_COPY = {
  heading: "Candidate documentation backup",
  explainer:
    "Candidate documentation is saved on this device only. Download a backup to keep a copy, and restore it on another device or after clearing your browser.",
  download: "Download backup",
  restore: "Restore from backup",
  nothingToBackUp: "No candidate documentation is saved on this device yet.",
  downloaded: (n: number) =>
    `Backup downloaded with ${n} candidate ${n === 1 ? "record" : "records"}.`,
  restored: (n: number) => `Restored ${n} candidate ${n === 1 ? "record" : "records"}.`,
  confirmOverwrite: (n: number) =>
    `${n} ${n === 1 ? "candidate already has" : "candidates already have"} documentation on this device. Replace with the backup?`,
  cancelled: "Restore cancelled. Nothing was changed.",
  storageUnavailable: "This browser's storage is unavailable, so the backup can't be used here.",
  signedOut: "Sign in to back up or restore your candidate documentation.",
  invalid: {
    not_json: "That file isn't a Verdant documentation backup.",
    too_large: "That file is too large to be a documentation backup.",
    wrong_format: "That file isn't a Verdant documentation backup.",
    unsupported_version: "That backup was made by a newer version of Verdant.",
    empty: "That backup has no candidate documentation in it.",
    too_many: "That backup has more records than can be restored at once.",
  },
} as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Keep only known sections/fields with string values (capped). */
function sanitizeValues(raw: unknown): PhenoDocumentationValues {
  const clean: PhenoDocumentationValues = {};
  if (!isPlainObject(raw)) return mergeDocumentationValues(null);
  for (const section of PHENO_DOCUMENTATION_DEFAULTS) {
    const s = raw[section.key];
    if (!isPlainObject(s)) continue;
    const fields: Record<string, string> = {};
    const rawFields = isPlainObject(s.fields) ? s.fields : {};
    for (const f of section.fields) {
      const v = rawFields[f.key];
      if (typeof v === "string") fields[f.key] = v.slice(0, PHENO_DOC_BACKUP_MAX_FIELD_LENGTH);
    }
    const diary =
      typeof s.diaryEntryId === "string" && RECORD_ID_RE.test(s.diaryEntryId)
        ? s.diaryEntryId
        : null;
    clean[section.key] = { fields, diaryEntryId: diary };
  }
  return mergeDocumentationValues(clean);
}

function compareRecords(a: PhenoDocRecord, b: PhenoDocRecord): number {
  if (a.recordType !== b.recordType) return a.recordType < b.recordType ? -1 : 1;
  return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;
}

/** Minimal read surface of Storage used for enumeration. */
export interface PhenoDocStorageReader {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

/** This user's saved records of one type, sorted by id. Unparsable values skipped. */
export function listPhenoDocRecordsInStorage(
  storage: PhenoDocStorageReader,
  userId: string | null,
  recordType: PhenoDocRecordType,
): PhenoDocRecord[] {
  if (!userId) return [];
  const prefix = phenoDocStorageKey(recordType, "", userId);
  const out: PhenoDocRecord[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const recordId = key.slice(prefix.length);
    if (!RECORD_ID_RE.test(recordId)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      out.push({ recordType, recordId, values: sanitizeValues(JSON.parse(raw)) });
    } catch {
      // Corrupt entry: skip rather than fail the whole backup.
    }
  }
  return out.sort(compareRecords);
}

export function buildPhenoDocumentationBackup(input: {
  readonly records: ReadonlyArray<PhenoDocRecord>;
  readonly exportedAt: string;
}): PhenoDocumentationBackup {
  return {
    format: PHENO_DOC_BACKUP_FORMAT,
    version: PHENO_DOC_BACKUP_VERSION,
    exportedAt: input.exportedAt,
    records: [...input.records].sort(compareRecords),
  };
}

export function parsePhenoDocumentationBackup(text: string): PhenoDocBackupParseResult {
  if (typeof text !== "string" || text.length > PHENO_DOC_BACKUP_MAX_TEXT_LENGTH) {
    return { ok: false, reason: "too_large" };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not_json" };
  }
  if (!isPlainObject(data) || data.format !== PHENO_DOC_BACKUP_FORMAT) {
    return { ok: false, reason: "wrong_format" };
  }
  if (data.version !== PHENO_DOC_BACKUP_VERSION)
    return { ok: false, reason: "unsupported_version" };
  const rawRecords = Array.isArray(data.records) ? data.records : [];
  if (rawRecords.length > PHENO_DOC_BACKUP_MAX_RECORDS) return { ok: false, reason: "too_many" };
  const byKey = new Map<string, PhenoDocRecord>();
  for (const r of rawRecords) {
    if (!isPlainObject(r)) continue;
    if (typeof r.recordType !== "string" || !RECORD_TYPES.has(r.recordType)) continue;
    if (typeof r.recordId !== "string" || !RECORD_ID_RE.test(r.recordId)) continue;
    const rec: PhenoDocRecord = {
      recordType: r.recordType as PhenoDocRecordType,
      recordId: r.recordId,
      values: sanitizeValues(r.values),
    };
    byKey.set(`${rec.recordType}:${rec.recordId}`, rec);
  }
  if (byKey.size === 0) return { ok: false, reason: "empty" };
  return { ok: true, records: [...byKey.values()].sort(compareRecords) };
}

export interface PhenoDocRestorePlan {
  readonly newCount: number;
  readonly overwriteCount: number;
  readonly writes: ReadonlyArray<{ readonly key: string; readonly value: string }>;
}

/** Storage writes for a restore under the signed-in user, plus overwrite counts. */
export function planPhenoDocumentationRestore(input: {
  readonly userId: string;
  readonly existingKeys: ReadonlySet<string>;
  readonly records: ReadonlyArray<PhenoDocRecord>;
}): PhenoDocRestorePlan {
  let overwriteCount = 0;
  const writes = [...input.records].sort(compareRecords).map((r) => {
    const key = phenoDocStorageKey(r.recordType, r.recordId, input.userId);
    if (input.existingKeys.has(key)) overwriteCount += 1;
    return { key, value: JSON.stringify(r.values) };
  });
  return { newCount: writes.length - overwriteCount, overwriteCount, writes };
}

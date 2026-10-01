/**
 * #552 — candidate documentation lives in localStorage only. A versioned JSON
 * backup lets growers carry it across devices without a schema change.
 */
import { describe, it, expect } from "vitest";
import {
  PHENO_DOC_BACKUP_FORMAT,
  PHENO_DOC_BACKUP_MAX_RECORDS,
  buildPhenoDocumentationBackup,
  listPhenoDocRecordsInStorage,
  parsePhenoDocumentationBackup,
  phenoDocStorageKey,
  planPhenoDocumentationRestore,
} from "@/lib/phenoDocumentationBackupRules";

const U = "user-1";

function store(entries: Record<string, string>) {
  const keys = Object.keys(entries);
  return {
    length: keys.length,
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => (k in entries ? entries[k] : null),
  };
}

const notes = (text: string) => ({
  phenotype: { fields: { unique_traits: text }, diaryEntryId: null },
});

describe("phenoDocStorageKey", () => {
  it("is user-scoped when signed in, legacy device-scoped otherwise", () => {
    expect(phenoDocStorageKey("candidate", "p1", U)).toBe("phenoDocs:user-1:candidate:p1");
    expect(phenoDocStorageKey("candidate", "p1", null)).toBe("phenoDocs:candidate:p1");
  });
});

describe("listPhenoDocRecordsInStorage", () => {
  it("returns only this user's candidate records, sorted, skipping unparsable values", () => {
    const s = store({
      [phenoDocStorageKey("candidate", "p2", U)]: JSON.stringify(notes("b")),
      [phenoDocStorageKey("candidate", "p1", U)]: JSON.stringify(notes("a")),
      [phenoDocStorageKey("candidate", "p9", "other-user")]: JSON.stringify(notes("x")),
      [phenoDocStorageKey("candidate", "p3", null)]: JSON.stringify(notes("legacy")),
      [phenoDocStorageKey("candidate", "p4", U)]: "{not json",
      "verdant:pheno-hunt-draft:x": "{}",
    });
    const recs = listPhenoDocRecordsInStorage(s, U, "candidate");
    expect(recs.map((r) => r.recordId)).toEqual(["p1", "p2"]);
    expect(recs[0].values.phenotype.fields.unique_traits).toBe("a");
  });
  it("signed out → nothing (legacy device data is never attributed)", () => {
    expect(listPhenoDocRecordsInStorage(store({}), null, "candidate")).toEqual([]);
  });
});

describe("build + parse round trip", () => {
  it("round-trips records and carries no user id", () => {
    const backup = buildPhenoDocumentationBackup({
      records: [
        { recordType: "candidate", recordId: "p2", values: notes("b") },
        { recordType: "candidate", recordId: "p1", values: notes("a") },
      ],
      exportedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(backup.format).toBe(PHENO_DOC_BACKUP_FORMAT);
    expect(backup.records.map((r) => r.recordId)).toEqual(["p1", "p2"]);
    const text = JSON.stringify(backup);
    expect(text).not.toContain(U);
    const parsed = parsePhenoDocumentationBackup(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.records).toHaveLength(2);
      expect(parsed.records[0].values.phenotype.fields.unique_traits).toBe("a");
    }
  });
});

describe("parsePhenoDocumentationBackup — untrusted file", () => {
  const valid = (records: unknown[]) =>
    JSON.stringify({ format: PHENO_DOC_BACKUP_FORMAT, version: 1, exportedAt: "x", records });

  it("rejects non-JSON, wrong format and unknown versions", () => {
    expect(parsePhenoDocumentationBackup("nope")).toEqual({ ok: false, reason: "not_json" });
    expect(parsePhenoDocumentationBackup(JSON.stringify({ format: "other" }))).toEqual({
      ok: false,
      reason: "wrong_format",
    });
    expect(
      parsePhenoDocumentationBackup(
        JSON.stringify({ format: PHENO_DOC_BACKUP_FORMAT, version: 2 }),
      ),
    ).toEqual({ ok: false, reason: "unsupported_version" });
  });

  it("rejects an empty backup and one over the record cap", () => {
    expect(parsePhenoDocumentationBackup(valid([]))).toEqual({ ok: false, reason: "empty" });
    const many = Array.from({ length: PHENO_DOC_BACKUP_MAX_RECORDS + 1 }, (_, i) => ({
      recordType: "candidate",
      recordId: `p${i}`,
      values: notes("x"),
    }));
    expect(parsePhenoDocumentationBackup(valid(many))).toEqual({ ok: false, reason: "too_many" });
  });

  it("drops malformed records and unknown sections/fields; keeps only strings", () => {
    const parsed = parsePhenoDocumentationBackup(
      valid([
        {
          recordType: "candidate",
          recordId: "p1",
          values: {
            phenotype: {
              fields: { unique_traits: "ok", injected: "x", growth_characteristics: 5 },
            },
            evil: { fields: {} },
          },
        },
        { recordType: "admin", recordId: "p2", values: notes("x") },
        { recordType: "candidate", recordId: "", values: notes("x") },
        { recordType: "candidate", recordId: "a/b:c", values: notes("x") },
        "junk",
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.records.map((r) => r.recordId)).toEqual(["p1"]);
    const v = parsed.records[0].values;
    expect(v.phenotype.fields.unique_traits).toBe("ok");
    expect(v.phenotype.fields).not.toHaveProperty("injected");
    expect(v.phenotype.fields.growth_characteristics).toBe("");
    expect(v).not.toHaveProperty("evil");
  });

  it("caps very long field values", () => {
    const parsed = parsePhenoDocumentationBackup(
      valid([{ recordType: "candidate", recordId: "p1", values: notes("x".repeat(20000)) }]),
    );
    expect(parsed.ok && parsed.records[0].values.phenotype.fields.unique_traits.length).toBe(10000);
  });
});

describe("planPhenoDocumentationRestore", () => {
  it("counts new records and overwrites of records already on this device", () => {
    const existing = new Set([phenoDocStorageKey("candidate", "p1", U)]);
    const plan = planPhenoDocumentationRestore({
      userId: U,
      existingKeys: existing,
      records: [
        { recordType: "candidate", recordId: "p1", values: notes("a") },
        { recordType: "candidate", recordId: "p2", values: notes("b") },
      ],
    });
    expect(plan.newCount).toBe(1);
    expect(plan.overwriteCount).toBe(1);
    expect(plan.writes.map((w) => w.key)).toEqual([
      phenoDocStorageKey("candidate", "p1", U),
      phenoDocStorageKey("candidate", "p2", U),
    ]);
  });
});

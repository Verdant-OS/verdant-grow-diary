/**
 * #552 — candidate documentation lives in localStorage only. A versioned JSON
 * backup lets growers carry it across devices without a schema change.
 */
import { describe, it, expect } from "vitest";
import {
  PHENO_DOC_BACKUP_FORMAT,
  PHENO_DOC_BACKUP_MAX_RECORDS,
  buildPhenoDocumentationBackup,
  canSavePhenoDocOverStored,
  listExistingPhenoDocKeys,
  listPhenoDocRecordsInStorage,
  parsePhenoDocumentationBackup,
  phenoDocChangeAffectsRecord,
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

  it("keeps long field values whole instead of truncating them (#552 Codex P2)", () => {
    const long = "x".repeat(20000);
    const parsed = parsePhenoDocumentationBackup(
      valid([{ recordType: "candidate", recordId: "p1", values: notes(long) }]),
    );
    expect(parsed.ok && parsed.records[0].values.phenotype.fields.unique_traits).toBe(long);
    const listed = listPhenoDocRecordsInStorage(
      store({ [phenoDocStorageKey("candidate", "p1", U)]: JSON.stringify(notes(long)) }),
      U,
      "candidate",
    );
    expect(listed[0].values.phenotype.fields.unique_traits).toBe(long);
  });

  it("restores an exported blank record and a diary-only section (#552 Codex re-review)", () => {
    const exported = buildPhenoDocumentationBackup({
      records: listPhenoDocRecordsInStorage(
        store({ [phenoDocStorageKey("candidate", "p1", U)]: JSON.stringify(notes("")) }),
        U,
        "candidate",
      ),
      exportedAt: "x",
    });
    const blank = parsePhenoDocumentationBackup(JSON.stringify(exported));
    expect(blank.ok && blank.records.map((r) => r.recordId)).toEqual(["p1"]);
    const diaryOnly = parsePhenoDocumentationBackup(
      valid([
        { recordType: "candidate", recordId: "p2", values: { phenotype: { diaryEntryId: "d1" } } },
      ]),
    );
    expect(diaryOnly.ok && diaryOnly.records[0].values.phenotype.diaryEntryId).toBe("d1");
  });

  it("skips a record whose values are missing or malformed (#552 Codex P2)", () => {
    const bad = [
      { recordType: "candidate", recordId: "p1" },
      { recordType: "candidate", recordId: "p2", values: "x" },
      { recordType: "candidate", recordId: "p3", values: { evil: { fields: {} } } },
      { recordType: "candidate", recordId: "p4", values: [] },
      { recordType: "candidate", recordId: "p6", values: { phenotype: {} } },
      { recordType: "candidate", recordId: "p7", values: { phenotype: { fields: "bad" } } },
      { recordType: "candidate", recordId: "p8", values: { phenotype: { fields: { nope: "x" } } } },
      {
        recordType: "candidate",
        recordId: "p9",
        values: { phenotype: { fields: { unique_traits: 5 } } },
      },
    ];
    expect(parsePhenoDocumentationBackup(valid(bad))).toEqual({ ok: false, reason: "empty" });
    const mixed = parsePhenoDocumentationBackup(
      valid([...bad, { recordType: "candidate", recordId: "p5", values: notes("keep") }]),
    );
    expect(mixed.ok && mixed.records.map((r) => r.recordId)).toEqual(["p5"]);
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

describe("#552 review follow-ups", () => {
  it("restores candidate records only; breeding_program entries are ignored", () => {
    const text = JSON.stringify({
      format: PHENO_DOC_BACKUP_FORMAT,
      version: 1,
      exportedAt: "x",
      records: [
        { recordType: "breeding_program", recordId: "b1", values: notes("bp") },
        { recordType: "candidate", recordId: "p1", values: notes("c") },
      ],
    });
    const parsed = parsePhenoDocumentationBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.records.map((r) => `${r.recordType}:${r.recordId}`)).toEqual(["candidate:p1"]);
  });

  it("treats a breeding_program-only file as empty", () => {
    const text = JSON.stringify({
      format: PHENO_DOC_BACKUP_FORMAT,
      version: 1,
      exportedAt: "x",
      records: [{ recordType: "breeding_program", recordId: "b1", values: notes("bp") }],
    });
    expect(parsePhenoDocumentationBackup(text)).toEqual({ ok: false, reason: "empty" });
  });

  it("lists every existing storage key", () => {
    const k = phenoDocStorageKey("candidate", "p1", U);
    expect([...listExistingPhenoDocKeys(store({ [k]: "{}", other: "1" }))].sort()).toEqual(
      [k, "other"].sort(),
    );
  });

  it("matches a change to the record it touched, and a cleared storage to every record", () => {
    const k = phenoDocStorageKey("candidate", "p1", U);
    expect(phenoDocChangeAffectsRecord([k], k)).toBe(true);
    expect(phenoDocChangeAffectsRecord([phenoDocStorageKey("candidate", "p2", U)], k)).toBe(false);
    expect(phenoDocChangeAffectsRecord(null, k)).toBe(true);
  });

  it("allows Save only over the exact stored value the form hydrated from", () => {
    expect(canSavePhenoDocOverStored(null, null)).toBe(true);
    expect(canSavePhenoDocOverStored('{"a":1}', '{"a":1}')).toBe(true);
    expect(canSavePhenoDocOverStored('{"a":1}', '{"a":2}')).toBe(false);
    expect(canSavePhenoDocOverStored(null, '{"a":2}')).toBe(false);
    expect(canSavePhenoDocOverStored('{"a":1}', null)).toBe(false);
  });
});

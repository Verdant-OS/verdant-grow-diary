/**
 * Release Receipt Parser Contract v1 — tests.
 *
 * Pure parser tests + static safety scan over the new contract/parser files.
 * No I/O beyond reading local fixture JSON.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  RELEASE_RECEIPT_SCHEMA_VERSION,
} from "@/lib/releaseReceiptParserContract";
import {
  isReleaseReceiptArtifactV1,
  normalizeReleaseReceiptBlockers,
  normalizeReleaseReceiptToEvidenceReceipt,
  parseReleaseReceiptArtifact,
} from "@/lib/releaseReceiptParser";
import {
  deriveReleaseEvidencePosture,
  RELEASE_READINESS_EVIDENCE_BLOCKERS,
  RELEASE_READINESS_EVIDENCE_RECEIPTS,
} from "@/lib/releaseReadinessEvidenceReceiptViewModel";

const FIX_DIR = path.resolve(__dirname, "fixtures");

function readFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIX_DIR, name), "utf8"));
}

const ciPass = readFixture("release-receipt-ci-pass.json");
const ciFail = readFixture("release-receipt-ci-fail.json");
const ciBlocked = readFixture("release-receipt-ci-blocked.json");
const malformed = readFixture("release-receipt-malformed.json");

describe("releaseReceiptParser — contract acceptance", () => {
  it("accepts a valid passing full-suite CI artifact", () => {
    const r = parseReleaseReceiptArtifact(ciPass);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.artifact.schema_version).toBe(RELEASE_RECEIPT_SCHEMA_VERSION);
    expect(r.artifact.receipt_kind).toBe("ci_full_suite");
    expect(r.artifact.status).toBe("pass");
    expect(r.blockers).toHaveLength(0);
  });

  it("normalizes passing CI artifact with canUnlockReleaseGo=true", () => {
    const r = parseReleaseReceiptArtifact(ciPass);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.evidenceReceipt.canUnlockReleaseGo).toBe(true);
    expect(r.evidenceReceipt.blocksReleaseGo).toBe(false);
    expect(r.evidenceReceipt.category).toBe("ci_full_suite");
  });

  it("failing CI artifact becomes blocking evidence and cannot unlock GO", () => {
    const r = parseReleaseReceiptArtifact(ciFail);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.evidenceReceipt.canUnlockReleaseGo).toBe(false);
    expect(r.evidenceReceipt.blocksReleaseGo).toBe(true);
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it("blocked CI artifact produces an active release blocker", () => {
    const r = parseReleaseReceiptArtifact(ciBlocked);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.evidenceReceipt.canUnlockReleaseGo).toBe(false);
    expect(r.evidenceReceipt.blocksReleaseGo).toBe(true);
    expect(r.blockers.map((b) => b.id)).toContain("github-actions-billing-limit");
  });

  it("local_targeted artifact cannot unlock GO even when passing", () => {
    const local = {
      ...(ciPass as Record<string, unknown>),
      artifact_id: "local-targeted-001",
      receipt_kind: "local_targeted",
      source: "local_parser",
    };
    const r = parseReleaseReceiptArtifact(local);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.evidenceReceipt.canUnlockReleaseGo).toBe(false);
    expect(r.evidenceReceipt.blocksReleaseGo).toBe(false);
  });

  it("manual_operator_note artifact cannot unlock GO even when passing", () => {
    const note = {
      ...(ciPass as Record<string, unknown>),
      artifact_id: "manual-note-001",
      receipt_kind: "manual_operator_note",
      source: "manual_import",
    };
    const r = parseReleaseReceiptArtifact(note);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.evidenceReceipt.canUnlockReleaseGo).toBe(false);
    expect(r.evidenceReceipt.blocksReleaseGo).toBe(false);
  });
});

describe("releaseReceiptParser — rejection rules", () => {
  it("rejects unknown schema version", () => {
    const r = parseReleaseReceiptArtifact({
      ...(ciPass as object),
      schema_version: "release-receipt.v9",
    });
    expect(r.ok).toBe(false);
    if (r.ok === true) {
      throw new Error("expected failure");
    }
    expect(r.errors.join(" ")).toMatch(/schema_version/);


  });

  it("rejects missing required fields", () => {
    const r = parseReleaseReceiptArtifact({
      schema_version: RELEASE_RECEIPT_SCHEMA_VERSION,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid status", () => {
    const r = parseReleaseReceiptArtifact({
      ...(ciPass as object),
      status: "winning",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid generated_at", () => {
    const r = parseReleaseReceiptArtifact({
      ...(ciPass as object),
      generated_at: "yesterday",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects negative counts", () => {
    const r = parseReleaseReceiptArtifact({
      ...(ciPass as object),
      counts: { passed: -1, failed: 0, skipped: 0, total: -1 },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects inconsistent total", () => {
    const r = parseReleaseReceiptArtifact({
      ...(ciPass as object),
      counts: { passed: 1, failed: 1, skipped: 1, total: 99 },
    });
    expect(r.ok).toBe(false);
    if (r.ok === true) throw new Error("expected failure");
    expect(r.errors.join(" ")).toMatch(/total/);
  });

  it("rejects manual_import source for ci_full_suite", () => {
    const r = parseReleaseReceiptArtifact({
      ...(ciPass as object),
      source: "manual_import",
    });
    expect(r.ok).toBe(false);
    if (r.ok === true) throw new Error("expected failure");
    expect(r.errors.join(" ")).toMatch(/manual_import/);
  });

  it("rejects unsafe metadata / secret-like strings", () => {
    const r = parseReleaseReceiptArtifact({
      ...(ciPass as object),
      metadata: { leak: "Authorization: Bearer sk-123" },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects forbidden metadata keys", () => {
    const r = parseReleaseReceiptArtifact({
      ...(ciPass as object),
      metadata: { service_role: "anything" },
    });
    expect(r.ok).toBe(false);
  });

  it("malformed fixture returns structured failure (no throw)", () => {
    expect(() => parseReleaseReceiptArtifact(malformed)).not.toThrow();
    const r = parseReleaseReceiptArtifact(malformed);
    expect(r.ok).toBe(false);
  });

  it("isReleaseReceiptArtifactV1 narrows correctly", () => {
    expect(isReleaseReceiptArtifactV1(ciPass)).toBe(true);
    expect(isReleaseReceiptArtifactV1(malformed)).toBe(false);
    expect(isReleaseReceiptArtifactV1(null)).toBe(false);
  });

  it("normalization is deterministic for identical input", () => {
    const a = parseReleaseReceiptArtifact(ciPass);
    const b = parseReleaseReceiptArtifact(ciPass);
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.evidenceReceipt).toEqual(b.evidenceReceipt);
    expect(a.blockers).toEqual(b.blockers);
  });

  it("direct normalizers are pure functions of artifact", () => {
    const r = parseReleaseReceiptArtifact(ciBlocked);
    if (r.ok === false) throw new Error("expected ok");
    expect(normalizeReleaseReceiptToEvidenceReceipt(r.artifact)).toEqual(
      r.evidenceReceipt,
    );
    expect(normalizeReleaseReceiptBlockers(r.artifact)).toEqual(r.blockers);
  });
});

describe("releaseReceiptParser — posture integration", () => {
  it("parsed passing CI + no blockers → posture GO", () => {
    const r = parseReleaseReceiptArtifact(ciPass);
    if (r.ok === false) throw new Error("expected ok");
    const posture = deriveReleaseEvidencePosture([r.evidenceReceipt], r.blockers);
    expect(posture.posture).toBe("GO");
  });

  it("parsed blocked CI keeps HOLD", () => {
    const r = parseReleaseReceiptArtifact(ciBlocked);
    if (r.ok === false) throw new Error("expected ok");
    const posture = deriveReleaseEvidencePosture([r.evidenceReceipt], r.blockers);
    expect(posture.posture).toBe("HOLD");
  });

  it("malformed artifact is not included as trusted evidence (default seed stays HOLD)", () => {
    const r = parseReleaseReceiptArtifact(malformed);
    expect(r.ok).toBe(false);
    const posture = deriveReleaseEvidencePosture(
      RELEASE_READINESS_EVIDENCE_RECEIPTS,
      RELEASE_READINESS_EVIDENCE_BLOCKERS,
    );
    expect(posture.posture).toBe("HOLD");
  });
});

describe("releaseReceiptParser — static safety scan", () => {
  const FILES = [
    "src/lib/releaseReceiptParserContract.ts",
    "src/lib/releaseReceiptParser.ts",
  ];
  const FORBIDDEN_RUNTIME = [
    "fetch(",
    "functions.invoke",
    "supabase.from(",
    "supabase.auth",
    "setInterval(",
    "localStorage",
    "sessionStorage",
    "api.github.com",
    "https://api.github",
    "process.env",
  ];

  it.each(FILES)("%s contains no runtime I/O or unsafe calls", (rel) => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "..", rel), "utf8");
    for (const term of FORBIDDEN_RUNTIME) {
      expect(src, `${rel} should not contain "${term}"`).not.toContain(term);
    }
  });
});

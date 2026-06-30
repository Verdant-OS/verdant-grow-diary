/**
 * Release Receipt Emitter v1 — tests.
 *
 * Pure tests over emitter logic. No I/O; no network; no Supabase.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  deriveReleaseReceiptCounts,
  deriveReleaseReceiptStatus,
  emitReleaseReceiptArtifact,
  type EmitReleaseReceiptInput,
} from "@/lib/releaseReceiptEmitter";
import { RELEASE_RECEIPT_SCHEMA_VERSION } from "@/lib/releaseReceiptParserContract";
import {
  isReleaseReceiptArtifactV1,
  parseReleaseReceiptArtifact,
} from "@/lib/releaseReceiptParser";

const baseCommand = {
  name: "vitest-batched",
  command: "node scripts/run-vitest-batches.mjs",
  status: "pass" as const,
  passed: 100,
  failed: 0,
  skipped: 2,
  duration_ms: 12000,
  summary: "All batches green.",
};

function ciInput(
  overrides: Partial<EmitReleaseReceiptInput> = {},
): EmitReleaseReceiptInput {
  return {
    artifactId: "ci-full-suite-emitter-001",
    generatedAt: "2026-06-30T12:00:00.000Z",
    source: "github_actions",
    receiptKind: "ci_full_suite",
    summary: "All vitest batches green.",
    commands: [baseCommand],
    blockers: [],
    metadata: { runner_os: "ubuntu-22.04" },
    sourceRunId: "1234",
    commitSha: "abcdef0123456789abcdef0123456789abcdef01",
    branch: "main",
    workflowName: "Verdant CI — Full Suite",
    ...overrides,
  };
}

describe("releaseReceiptEmitter — counts", () => {
  it("sums counts deterministically", () => {
    const counts = deriveReleaseReceiptCounts([
      { ...baseCommand, passed: 10, failed: 1, skipped: 2 },
      { ...baseCommand, passed: 5, failed: 0, skipped: 0 },
    ]);
    expect(counts).toEqual({ passed: 15, failed: 1, skipped: 2, total: 18 });
  });

  it("handles empty commands", () => {
    expect(deriveReleaseReceiptCounts([])).toEqual({
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
    });
  });
});

describe("releaseReceiptEmitter — status derivation", () => {
  it("returns unknown for no commands", () => {
    expect(deriveReleaseReceiptStatus([], [])).toBe("unknown");
  });

  it("any active release_blocker forces blocked", () => {
    const s = deriveReleaseReceiptStatus(
      [baseCommand],
      [
        {
          id: "billing",
          label: "Billing",
          severity: "release_blocker",
          active: true,
          summary: "GH billing limit",
        },
      ],
    );
    expect(s).toBe("blocked");
  });

  it("any failing command downgrades to fail", () => {
    const s = deriveReleaseReceiptStatus(
      [baseCommand, { ...baseCommand, status: "fail", failed: 3 }],
      [],
    );
    expect(s).toBe("fail");
  });

  it("blocked command without fail returns blocked", () => {
    const s = deriveReleaseReceiptStatus(
      [{ ...baseCommand, status: "blocked" }],
      [],
    );
    expect(s).toBe("blocked");
  });

  it("unknown command without fail/blocked returns unknown", () => {
    const s = deriveReleaseReceiptStatus(
      [{ ...baseCommand, status: "unknown" }],
      [],
    );
    expect(s).toBe("unknown");
  });

  it("all-pass commands return pass", () => {
    expect(deriveReleaseReceiptStatus([baseCommand], [])).toBe("pass");
  });

  it("all-skipped commands return pending", () => {
    expect(
      deriveReleaseReceiptStatus(
        [{ ...baseCommand, status: "skipped" }],
        [],
      ),
    ).toBe("pending");
  });
});

describe("releaseReceiptEmitter — emit + roundtrip", () => {
  it("emits a passing CI artifact accepted by the parser", () => {
    const r = emitReleaseReceiptArtifact(ciInput());
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.artifact.schema_version).toBe(RELEASE_RECEIPT_SCHEMA_VERSION);
    expect(r.artifact.status).toBe("pass");
    expect(isReleaseReceiptArtifactV1(r.artifact)).toBe(true);

    const reparsed = parseReleaseReceiptArtifact(r.artifact);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok === false) throw new Error("expected ok");
    expect(reparsed.evidenceReceipt.canUnlockReleaseGo).toBe(true);
  });

  it("is deterministic for identical input", () => {
    const a = emitReleaseReceiptArtifact(ciInput());
    const b = emitReleaseReceiptArtifact(ciInput());
    if (a.ok === false || b.ok === false) throw new Error("expected ok");
    expect(a.artifact).toEqual(b.artifact);
  });

  it("active release_blocker downgrades status to blocked", () => {
    const r = emitReleaseReceiptArtifact(
      ciInput({
        blockers: [
          {
            id: "github-actions-billing-limit",
            label: "GH Actions billing",
            severity: "release_blocker",
            active: true,
            summary: "spend limit reached",
          },
        ],
      }),
    );
    if (r.ok === false) throw new Error("expected ok");
    expect(r.artifact.status).toBe("blocked");
  });

  it("rejects ci_full_suite + manual_import via parser roundtrip", () => {
    const r = emitReleaseReceiptArtifact(
      ciInput({ source: "manual_import" }),
    );
    expect(r.ok).toBe(false);
    if (r.ok === true) throw new Error("expected failure");
    expect(r.errors.join(" ")).toMatch(/manual_import/);
  });

  it("rejects unsafe metadata", () => {
    const r = emitReleaseReceiptArtifact(
      ciInput({ metadata: { leak: "Authorization: Bearer sk-123" } }),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects forbidden metadata keys", () => {
    const r = emitReleaseReceiptArtifact(
      ciInput({ metadata: { service_role: "x" } }),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects invalid generated_at", () => {
    const r = emitReleaseReceiptArtifact(
      ciInput({ generatedAt: "yesterday" }),
    );
    expect(r.ok).toBe(false);
  });

  it("local_targeted artifact emitted is accepted but cannot unlock GO", () => {
    const r = emitReleaseReceiptArtifact(
      ciInput({
        artifactId: "local-001",
        receiptKind: "local_targeted",
        source: "local_parser",
      }),
    );
    if (r.ok === false) throw new Error("expected ok");
    const parsed = parseReleaseReceiptArtifact(r.artifact);
    if (parsed.ok === false) throw new Error("expected ok");
    expect(parsed.evidenceReceipt.canUnlockReleaseGo).toBe(false);
  });
});

describe("releaseReceiptEmitter — static safety scan", () => {
  const FILE = "src/lib/releaseReceiptEmitter.ts";
  const FORBIDDEN = [
    "fetch(",
    "functions.invoke",
    "supabase.from(",
    "supabase.auth",
    "setInterval(",
    "setTimeout(",
    "localStorage",
    "sessionStorage",
    "api.github.com",
    "https://api.github",
    "process.env",
    "import 'node:fs'",
    "import \"node:fs\"",
    "from 'node:fs'",
    "from \"node:fs\"",
    "child_process",
    "Date.now(",
    "new Date(",
  ];

  it("emitter source contains no runtime I/O or unsafe calls", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "..", FILE), "utf8");
    for (const term of FORBIDDEN) {
      expect(src, `${FILE} should not contain "${term}"`).not.toContain(term);
    }
  });
});

/**
 * One-Tent Loop Evidence Handoff — static safety scan.
 *
 * Scans the *pure* handoff modules for accidental:
 *   - Supabase write calls or functions.invoke
 *   - Automation / device-control verbs
 *   - Certainty claims
 *   - "healthy" near "invalid/stale/demo/unknown/untrusted" on the same line
 *
 * Negation lines ("do not …", "never …", "must not …") are intentionally
 * allowed so that explicit "Do not command or control any hardware devices"
 * guardrail copy does not trip the scanner.
 *
 * Scope is intentionally limited to handoff/rule modules so that already
 * approved, RLS-gated write paths elsewhere in the repo are not flagged.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = process.cwd();

const SCANNED_FILES = [
  "src/lib/alertActionQueueHandoffRules.ts",
  "src/lib/alertToActionQueueRules.ts",
  "src/lib/aiDoctorSessionToActionQueueRules.ts",
  "src/lib/alertActionQueueEvidenceViewModel.ts",
  "src/lib/aiDoctorSensorContextRules.ts",
  "src/lib/originatingTimelineEventRules.ts",
  "src/components/EvidenceLinkageBadges.tsx",
];

// Scope-limited subset for presenter-mount scanning. We only scan the
// regions of large pages that touch evidence linkage to avoid flagging
// unrelated legacy copy elsewhere in those files.
const MOUNT_SCANNED_FILES = [
  "src/pages/AlertDetail.tsx",
  "src/pages/ActionDetail.tsx",
];

const WRITE_TOKENS = [
  "functions.invoke",
  ".insert(",
  ".update(",
  ".delete(",
  "upsert(",
];

const AUTOMATION_PHRASES = [
  "automatically execute",
  "auto execute",
  "automatically control",
  "device command",
  "send command",
  "execute command",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "apply pesticide",
];

const CERTAINTY_PHRASES = [
  "guaranteed",
  "definitely",
  "certain diagnosis",
  "diagnosed from photo",
];

const UNTRUSTED_NEIGHBORS = ["invalid", "stale", "demo", "unknown", "untrusted"];

const NEGATION_MARKERS = [
  "do not",
  "don't",
  "never",
  "must not",
  "no automated",
  "no automation",
  "without grower",
  "without manual",
  "without explicit",
];

interface Finding {
  file: string;
  line: number;
  kind: string;
  phrase: string;
  excerpt: string;
}

function isNegated(line: string): boolean {
  const lower = line.toLowerCase();
  return NEGATION_MARKERS.some((n) => lower.includes(n));
}

function scanFile(file: string): Finding[] {
  const abs = join(ROOT, file);
  if (!existsSync(abs)) {
    throw new Error(`Scanned file is missing: ${file}`);
  }
  const raw = readFileSync(abs, "utf8");
  const stripped = stripSourceComments(raw);
  const lines = stripped.split("\n");
  const findings: Finding[] = [];

  lines.forEach((line, idx) => {
    const lower = line.toLowerCase();
    const excerpt = line.trim().slice(0, 200);

    for (const tok of WRITE_TOKENS) {
      if (line.includes(tok)) {
        findings.push({
          file,
          line: idx + 1,
          kind: "write/IO",
          phrase: tok,
          excerpt,
        });
      }
    }

    for (const phrase of AUTOMATION_PHRASES) {
      if (lower.includes(phrase) && !isNegated(line)) {
        findings.push({
          file,
          line: idx + 1,
          kind: "automation/device-control",
          phrase,
          excerpt,
        });
      }
    }

    for (const phrase of CERTAINTY_PHRASES) {
      if (lower.includes(phrase) && !isNegated(line)) {
        findings.push({
          file,
          line: idx + 1,
          kind: "certainty",
          phrase,
          excerpt,
        });
      }
    }

    // "healthy" must never appear on the same line as an untrusted neighbor.
    if (/\bhealthy\b/.test(lower)) {
      for (const neighbor of UNTRUSTED_NEIGHBORS) {
        if (lower.includes(neighbor) && !isNegated(line)) {
          findings.push({
            file,
            line: idx + 1,
            kind: "healthy-near-untrusted",
            phrase: `healthy + ${neighbor}`,
            excerpt,
          });
        }
      }
    }
  });

  return findings;
}

function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "no findings";
  return findings
    .map((f) => `  ${f.file}:${f.line} [${f.kind}] "${f.phrase}" — ${f.excerpt}`)
    .join("\n");
}

describe("One-Tent Loop Evidence Handoff — static safety", () => {
  it("scanned files all exist", () => {
    for (const f of SCANNED_FILES) {
      expect(existsSync(join(ROOT, f)), `${f} should exist`).toBe(true);
    }
  });

  it("no Supabase write calls or functions.invoke in handoff modules", () => {
    const findings = SCANNED_FILES.flatMap(scanFile).filter((f) => f.kind === "write/IO");
    expect(findings.length, `unexpected write/IO findings:\n${formatFindings(findings)}`).toBe(0);
  });

  it("no automation / device-control verbs (outside explicit 'do not' copy)", () => {
    const findings = SCANNED_FILES.flatMap(scanFile).filter(
      (f) => f.kind === "automation/device-control",
    );
    expect(
      findings.length,
      `unexpected automation phrases:\n${formatFindings(findings)}`,
    ).toBe(0);
  });

  it("no certainty claims (guaranteed / definitely / certain diagnosis / diagnosed from photo)", () => {
    const findings = SCANNED_FILES.flatMap(scanFile).filter((f) => f.kind === "certainty");
    expect(findings.length, `unexpected certainty claims:\n${formatFindings(findings)}`).toBe(0);
  });

  it("'healthy' never co-occurs with invalid/stale/demo/unknown/untrusted on the same line", () => {
    const findings = SCANNED_FILES.flatMap(scanFile).filter(
      (f) => f.kind === "healthy-near-untrusted",
    );
    expect(
      findings.length,
      `unexpected healthy-near-untrusted lines:\n${formatFindings(findings)}`,
    ).toBe(0);
  });
});

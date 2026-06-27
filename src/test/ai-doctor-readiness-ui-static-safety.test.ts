/**
 * ai-doctor-readiness-ui-static-safety
 *
 * Static safety scan over the AI Doctor Context Readiness UI path.
 * Read-only: no Supabase writes, no Action Queue, no device control,
 * no overclaim/healthy-on-untrusted phrasing should appear in source.
 *
 * Scope (files scanned when they exist):
 *   - src/components/AiDoctorContextReadinessPanel.tsx
 *   - src/components/PlantDetailAiDoctorContextReadinessMount.tsx
 *   - src/components/AiDoctorContextQuickActions.tsx
 *   - src/lib/aiDoctorReadinessViewModel.ts
 *   - src/lib/aiDoctorReadinessGateViewModel.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");

const SCANNED_FILES = [
  "src/components/AiDoctorContextReadinessPanel.tsx",
  "src/components/PlantDetailAiDoctorContextReadinessMount.tsx",
  "src/components/AiDoctorContextQuickActions.tsx",
  "src/lib/aiDoctorReadinessViewModel.ts",
  "src/lib/aiDoctorReadinessGateViewModel.ts",
] as const;

// At least these readiness path files MUST exist and be scanned.
const REQUIRED_FILES: readonly string[] = [
  "src/components/AiDoctorContextReadinessPanel.tsx",
  "src/components/PlantDetailAiDoctorContextReadinessMount.tsx",
  "src/lib/aiDoctorReadinessViewModel.ts",
];

const FORBIDDEN_PHRASES: readonly string[] = [
  // Supabase / mutation surfaces
  "functions.invoke",
  ".insert(",
  ".update(",
  ".delete(",
  "upsert(",
  "action_queue",
  // Device / automation language
  "device command",
  "automatically control",
  "auto execute",
  "auto-execute",
  "execute command",
  "turn on",
  "turn off",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "apply pesticide",
  // Overclaim / certainty language
  "guaranteed",
  "definitely",
  "certain diagnosis",
  "diagnosed from photo",
];

const UNTRUSTED_NEAR_HEALTHY_TOKENS = [
  "invalid",
  "stale",
  "demo",
  "unknown",
  "untrusted",
];

/**
 * Strip block and line comments to avoid false positives in JSDoc /
 * inline comments that mention forbidden phrases for documentation.
 */
function stripComments(source: string): string {
  // Block comments
  let out = source.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
  // Line comments
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, (m, pre: string) =>
    pre + " ".repeat(m.length - pre.length),
  );
  return out;
}

interface Finding {
  file: string;
  line: number;
  phrase: string;
  excerpt: string;
}

function scanFile(file: string): Finding[] {
  const full = resolve(REPO_ROOT, file);
  const raw = readFileSync(full, "utf8");
  const stripped = stripComments(raw);
  const lines = stripped.split(/\r?\n/);
  const findings: Finding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    for (const phrase of FORBIDDEN_PHRASES) {
      if (lower.includes(phrase.toLowerCase())) {
        findings.push({
          file,
          line: i + 1,
          phrase,
          excerpt: line.trim().slice(0, 200),
        });
      }
    }

    if (lower.includes("healthy")) {
      for (const token of UNTRUSTED_NEAR_HEALTHY_TOKENS) {
        if (lower.includes(token)) {
          findings.push({
            file,
            line: i + 1,
            phrase: `"healthy" near "${token}"`,
            excerpt: line.trim().slice(0, 200),
          });
        }
      }
    }
  }
  return findings;
}

describe("ai-doctor-readiness-ui-static-safety", () => {
  it("covers every required readiness path file that exists on disk", () => {
    for (const required of REQUIRED_FILES) {
      const onDisk = existsSync(resolve(REPO_ROOT, required));
      expect(onDisk, `${required} must exist on disk`).toBe(true);
      expect(
        SCANNED_FILES.includes(required as (typeof SCANNED_FILES)[number]),
        `${required} must be included in SCANNED_FILES`,
      ).toBe(true);
    }
  });

  it("scans at least one file", () => {
    const present = SCANNED_FILES.filter((f) =>
      existsSync(resolve(REPO_ROOT, f)),
    );
    expect(present.length).toBeGreaterThan(0);
  });

  it("contains no forbidden phrases on the readiness UI path", () => {
    const all: Finding[] = [];
    for (const file of SCANNED_FILES) {
      if (!existsSync(resolve(REPO_ROOT, file))) continue;
      all.push(...scanFile(file));
    }

    if (all.length > 0) {
      const report = all
        .map(
          (f) =>
            `  - ${f.file}:${f.line}  [${f.phrase}]  → ${f.excerpt}`,
        )
        .join("\n");
      throw new Error(
        `Forbidden phrases detected on AI Doctor readiness UI path:\n${report}`,
      );
    }
    expect(all).toEqual([]);
  });
});

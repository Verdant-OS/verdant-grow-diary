/**
 * Evidence Linkage UI Mount v1 — verifies EvidenceLinkageBadges is mounted
 * in the Alert Review (AlertDetail) and Action Queue suggestion (ActionDetail)
 * surfaces. Read-only / presenter-only check.
 *
 * No fetch, no Supabase, no automation, no device-control copy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Evidence Linkage UI Mount v1 — AlertDetail", () => {
  const src = readSrc("src/pages/AlertDetail.tsx");

  it("imports EvidenceLinkageBadges", () => {
    expect(src).toMatch(/from\s+"@\/components\/EvidenceLinkageBadges"/);
  });

  it("mounts EvidenceLinkageBadges with alert-review surface", () => {
    expect(src).toMatch(/<EvidenceLinkageBadges[\s\S]*?surface="alert-review"/);
  });

  it("uses the testId wrapper for the evidence linkage block", () => {
    expect(src).toContain('data-testid="alert-detail-evidence-linkage"');
  });

  it("passes alert-review provenance-aware fallback copy", () => {
    expect(src).toMatch(/fallbackCopy=\{ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY\}/);
    expect(src).toMatch(/from\s+"@\/lib\/originatingTimelineEventRules"/);
  });

  it("does not introduce write/control verbs in the mount", () => {
    const forbidden = [
      "functions.invoke",
      "automatically execute",
      "auto execute",
      "device command",
      "send command",
      "execute command",
      "set fan",
      "set light",
      "set irrigation",
      "dose nutrients",
      "apply pesticide",
    ];
    const lines = src.split("\n");
    const mountIdx = lines.findIndex((l) => l.includes("alert-detail-evidence-linkage"));
    expect(mountIdx).toBeGreaterThan(-1);
    const block = lines
      .slice(Math.max(0, mountIdx - 4), mountIdx + 8)
      .join("\n")
      .toLowerCase();
    for (const phrase of forbidden) {
      expect(block.includes(phrase), `unexpected "${phrase}" in mount block`).toBe(false);
    }
  });
});

describe("Evidence Linkage UI Mount v1 — ActionDetail", () => {
  const src = readSrc("src/pages/ActionDetail.tsx");

  it("imports EvidenceLinkageBadges", () => {
    expect(src).toMatch(/from\s+"@\/components\/EvidenceLinkageBadges"/);
  });

  it("mounts EvidenceLinkageBadges with action-queue-suggestion surface (alert-derived block)", () => {
    expect(src).toContain('data-testid="action-detail-alert-evidence-linkage"');
  });

  it("mounts EvidenceLinkageBadges with action-queue-suggestion surface (AI Doctor block)", () => {
    expect(src).toContain('data-testid="action-detail-ai-doctor-evidence-linkage"');
  });

  it("passes provenance-aware fallback copy per derivation block", () => {
    expect(src).toMatch(/fallbackCopy=\{ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY\}/);
    expect(src).toMatch(/fallbackCopy=\{ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY\}/);
    expect(src).toMatch(/from\s+"@\/lib\/originatingTimelineEventRules"/);
  });

  it("each mount uses the action-queue-suggestion surface tag", () => {
    const matches = src.match(/<EvidenceLinkageBadges[\s\S]*?surface="action-queue-suggestion"/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("approval-required copy remains visible in the surrounding section", () => {
    // "requires grower approval" is the existing AI Doctor block copy.
    expect(src.toLowerCase()).toMatch(/requires grower approval/);
  });

  it("does not introduce write/control verbs around the mounts", () => {
    const forbidden = [
      "automatically execute",
      "auto execute",
      "device command",
      "send command",
      "execute command",
      "set fan",
      "set light",
      "set irrigation",
      "dose nutrients",
      "apply pesticide",
    ];
    const lines = src.split("\n");
    for (const marker of [
      "action-detail-alert-evidence-linkage",
      "action-detail-ai-doctor-evidence-linkage",
    ]) {
      const idx = lines.findIndex((l) => l.includes(marker));
      expect(idx, `marker ${marker} missing`).toBeGreaterThan(-1);
      const block = lines
        .slice(Math.max(0, idx - 4), idx + 10)
        .join("\n")
        .toLowerCase();
      for (const phrase of forbidden) {
        expect(block.includes(phrase), `unexpected "${phrase}" near ${marker}`).toBe(false);
      }
    }
  });
});

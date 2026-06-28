/**
 * evidence-linkage-row-adapter-v1-blocked
 *
 * Slice C audit lock: proves that persisted `alerts` and `action_queue` row
 * shapes do NOT carry safe originating timeline event refs, and that
 * `AlertDetail` / `ActionDetail` continue to render the provenance-aware
 * fallback copy with `events={[]}`. Prevents anyone from quietly wiring
 * fabricated refs (timestamp, plant, metric, prose, alert-id, etc.) into the
 * `EvidenceLinkageBadges` mounts.
 *
 * Read-only static scan. No React render. No Supabase. No fetch.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY,
  ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY,
  ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY,
} from "@/lib/originatingTimelineEventRules";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Evidence Linkage Row Adapter v1 — BLOCKED audit lock", () => {
  it("alerts row shape exposes no structured timeline-ref field", () => {
    const types = read("src/integrations/supabase/types.ts");
    const start = types.indexOf("alerts: {");
    expect(start).toBeGreaterThan(-1);
    // Slice the alerts block (Row + Insert + Update + Relationships).
    const block = types.slice(start, start + 4000);
    const banned = [
      "originating_timeline",
      "linked_timeline",
      "timeline_event_ids",
      "grow_event_ids",
      "evidence_refs",
      "metadata",
      "details",
    ];
    for (const field of banned) {
      expect(block.includes(field)).toBe(false);
    }
  });

  it("action_queue row shape exposes no structured timeline-ref field", () => {
    const types = read("src/integrations/supabase/types.ts");
    const start = types.indexOf("action_queue: {");
    expect(start).toBeGreaterThan(-1);
    const block = types.slice(start, start + 4000);
    const banned = [
      "originating_timeline",
      "linked_timeline",
      "timeline_event_ids",
      "grow_event_ids",
      "evidence_refs",
      "metadata",
      "details",
    ];
    for (const field of banned) {
      expect(block.includes(field)).toBe(false);
    }
  });

  it("AlertRow in src/lib/alerts.ts exposes no timeline-ref field", () => {
    const src = read("src/lib/alerts.ts");
    const banned = [
      "originatingTimelineEvents",
      "originating_timeline_events",
      "linked_timeline_events",
      "timeline_event_ids",
      "evidence_refs",
    ];
    for (const field of banned) {
      expect(src.includes(field)).toBe(false);
    }
  });

  it("AlertDetail still passes empty events + provenance-aware fallback copy", () => {
    const src = read("src/pages/AlertDetail.tsx");
    expect(src).toContain("ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY");
    // The single alert-review mount keeps events={[]}.
    expect(
      src.includes("surface=\"alert-review\"") &&
        src.includes("events={[]}"),
    ).toBe(true);
  });

  it("ActionDetail still passes empty events + provenance-aware fallback copy on both mounts", () => {
    const src = read("src/pages/ActionDetail.tsx");
    expect(src).toContain(
      "ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY",
    );
    expect(src).toContain(
      "ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY",
    );
    // Both action-queue-suggestion mounts must still use events={[]}.
    const emptyMounts = src.match(/events=\{\[\]\}/g) ?? [];
    expect(emptyMounts.length).toBeGreaterThanOrEqual(2);
  });

  it("no originatingTimelineEventAdapter module is imported by detail pages", () => {
    for (const f of ["src/pages/AlertDetail.tsx", "src/pages/ActionDetail.tsx"]) {
      const src = read(f);
      expect(src.includes("originatingTimelineEventAdapter")).toBe(false);
    }
  });

  it("fallback copy constants are non-empty, calm, and do not claim certainty", () => {
    const banned = [
      "auto",
      "automated",
      "device",
      "command",
      "execute",
      "guaranteed",
      "certain",
    ];
    for (const copy of [
      ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY,
      ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY,
      ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY,
    ]) {
      expect(typeof copy).toBe("string");
      expect(copy.length).toBeGreaterThan(0);
      const lower = copy.toLowerCase();
      for (const tok of banned) {
        expect(lower.includes(tok)).toBe(false);
      }
    }
  });

  it("audit doc records BLOCKED verdict and unblock path", () => {
    const doc = read("docs/evidence-linkage-row-adapter-v1-audit.md");
    expect(doc).toMatch(/BLOCKED/);
    expect(doc).toMatch(/Unblock path/);
    expect(doc).toMatch(/Do not fabricate refs|fabricat/i);
  });
});

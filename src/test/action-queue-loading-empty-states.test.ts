/**
 * Loading / empty / missing-evidence safety copy tests for Action Queue
 * and Action Detail surfaces.
 *
 * These are presenter-only / static-source assertions:
 *   - Centralized empty + missing-evidence copy is exported from
 *     `actionQueueEvidenceViewModel.ts` and is safe (no automation,
 *     no device-control language, no fake live-data implication).
 *   - `src/pages/ActionQueue.tsx` wires the empty-pending constants
 *     and keeps an accessible loading skeleton with `aria-busy`.
 *   - `src/pages/ActionDetail.tsx` renders the loading state with
 *     `aria-busy` and surfaces the centralized missing-evidence help
 *     when no sanitized snapshot is attached.
 *   - No raw_payload / service_role / Bearer / private-id strings on
 *     these surfaces.
 *
 * Hard rules:
 *   - No production code modified by these tests.
 *   - Approval / rejection behavior untouched.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACTION_QUEUE_EMPTY_PENDING_TITLE,
  ACTION_QUEUE_EMPTY_PENDING_HELP,
  ACTION_EVIDENCE_MISSING_PANEL_TITLE,
  ACTION_EVIDENCE_MISSING_PANEL_HELP,
  ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL,
  buildActionEvidenceViewModel,
} from "@/lib/actionQueueEvidenceViewModel";

const ROOT = resolve(__dirname, "../..");
const ACTION_QUEUE_SRC = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");
const ACTION_DETAIL_SRC = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");

const UNSAFE_PATTERNS: ReadonlyArray<RegExp> = [
  /raw_payload/i,
  /service_role/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /Bearer\s+ey/i,
  /sk_live_/i,
  /\bturn (on|off)\b/i,
  /\bactuator\.(send|trigger|run|fire)/i,
  /\brelay\.(on|off|toggle)/i,
  /\bauto[- ]?run\b/i,
  /automatically (turn|run|trigger|dose|adjust)/i,
];

describe("Action Queue empty-state copy", () => {
  it("title and help are calm, approval-required, and free of automation/device-control implication", () => {
    expect(ACTION_QUEUE_EMPTY_PENDING_TITLE).toMatch(/no actions/i);
    expect(ACTION_QUEUE_EMPTY_PENDING_HELP).toMatch(/grower approval/i);
    for (const re of UNSAFE_PATTERNS) {
      expect(ACTION_QUEUE_EMPTY_PENDING_TITLE).not.toMatch(re);
      expect(ACTION_QUEUE_EMPTY_PENDING_HELP).not.toMatch(re);
    }
  });

  it("ActionQueue.tsx wires the centralized empty-pending constants", () => {
    expect(ACTION_QUEUE_SRC).toContain("ACTION_QUEUE_EMPTY_PENDING_TITLE");
    expect(ACTION_QUEUE_SRC).toContain("ACTION_QUEUE_EMPTY_PENDING_HELP");
    // Empty state container test id remains stable.
    expect(ACTION_QUEUE_SRC).toContain('data-testid="action-queue-empty-pending"');
  });
});

describe("Action Queue loading skeleton", () => {
  it("renders an accessible loading region (aria-busy + aria-live) without fake action data", () => {
    expect(ACTION_QUEUE_SRC).toContain('data-testid="action-queue-loading-skeleton"');
    expect(ACTION_QUEUE_SRC).toMatch(/aria-busy=["']?true["']?/);
    expect(ACTION_QUEUE_SRC).toMatch(/aria-live=["']?polite["']?/);
    expect(ACTION_QUEUE_SRC).toMatch(/aria-label=["']Loading pending actions["']/);
    // Skeleton placeholders must be hidden from screen readers so they
    // are never announced as real action data.
    const skeletonSlice = ACTION_QUEUE_SRC.slice(
      ACTION_QUEUE_SRC.indexOf("action-queue-loading-skeleton"),
      ACTION_QUEUE_SRC.indexOf("action-queue-loading-skeleton") + 1200,
    );
    expect(skeletonSlice).toMatch(/aria-hidden=["']?true["']?/);
  });

  it("loading skeleton block contains no grower-facing fake metric values", () => {
    const start = ACTION_QUEUE_SRC.indexOf("action-queue-loading-skeleton");
    const block = ACTION_QUEUE_SRC.slice(start, start + 1500);
    // No fake numbers / units / metric labels that could read as data.
    expect(block).not.toMatch(/\b\d+(\.\d+)?\s?(°|kpa|ppfd|ec|ph|%)\b/i);
    expect(block).not.toMatch(/temperature|humidity|vpd|soil/i);
  });
});

describe("Action Detail loading + missing-evidence states", () => {
  it("loading state uses aria-busy and a non-interactive spinner", () => {
    expect(ACTION_DETAIL_SRC).toMatch(/aria-busy=["']?true["']?/);
    expect(ACTION_DETAIL_SRC).toMatch(/Loading action…/);
    // The loading block must not render approve/reject buttons.
    const loadingIdx = ACTION_DETAIL_SRC.indexOf("Loading action");
    const slice = ACTION_DETAIL_SRC.slice(Math.max(0, loadingIdx - 400), loadingIdx + 200);
    expect(slice).not.toMatch(/Approve|Reject|Simulate/);
  });

  it("missing-evidence help is rendered via the centralized constant", () => {
    expect(ACTION_DETAIL_SRC).toContain("ACTION_EVIDENCE_MISSING_PANEL_HELP");
    expect(ACTION_DETAIL_SRC).toContain('data-testid="action-detail-evidence-missing-help"');
    expect(ACTION_EVIDENCE_MISSING_PANEL_HELP).toMatch(/diary timeline|sensor history|before approving/i);
    expect(ACTION_EVIDENCE_MISSING_PANEL_TITLE).toMatch(/not available/i);
    for (const re of UNSAFE_PATTERNS) {
      expect(ACTION_EVIDENCE_MISSING_PANEL_TITLE).not.toMatch(re);
      expect(ACTION_EVIDENCE_MISSING_PANEL_HELP).not.toMatch(re);
    }
  });

  it("evidence-quality unavailable copy still comes from the view-model", () => {
    const vm = buildActionEvidenceViewModel({ source: "ai_doctor" });
    expect(vm.hasSnapshotQuality).toBe(false);
    expect(vm.evidenceQualityLabel).toBe(ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL);
  });
});

describe("safety: loading + empty + missing surfaces leak no secrets and no unsafe language", () => {
  it("neither page introduces raw_payload / service_role / token strings on loading or empty surfaces", () => {
    for (const src of [ACTION_QUEUE_SRC, ACTION_DETAIL_SRC]) {
      expect(src).not.toMatch(/raw_payload/i);
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
      expect(src).not.toMatch(/Bearer\s+ey/i);
      expect(src).not.toMatch(/sk_live_/i);
    }
  });
});

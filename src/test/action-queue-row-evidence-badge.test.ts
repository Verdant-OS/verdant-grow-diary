/**
 * Action Queue row evidence badge tests.
 *
 * Verifies:
 *   - ActionQueue.tsx renders EvidenceStatusBadge on both pending and reviewed rows.
 *   - Badge test-ids map to the three statuses: available, quality_unavailable, missing.
 *   - Badge copy is compact and does not duplicate long missing-evidence panel text.
 *   - Badge contains no unsafe automation / device-control language.
 *   - Badge contains no raw_payload / service_role / token / private-id leakage.
 *   - Approval/rejection UI and behavior are untouched.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const ACTION_QUEUE_SRC = readFileSync(
  resolve(ROOT, "src/pages/ActionQueue.tsx"),
  "utf8",
);

describe("Action Queue row evidence status badge", () => {
  it("ActionQueue.tsx imports the evidence view-model type and renders EvidenceStatusBadge", () => {
    expect(ACTION_QUEUE_SRC).toContain("type ActionEvidenceViewModel");
    expect(ACTION_QUEUE_SRC).toContain("EvidenceStatusBadge");
  });

  it("pending rows reference evidence status data-testids for all three states", () => {
    expect(ACTION_QUEUE_SRC).toContain(
      'data-testid={`action-queue-row-evidence-status-${vm.rowEvidenceStatus}`}',
    );
  });

  it("reviewed rows also render the evidence status badge", () => {
    // The reviewed map block must call buildActionEvidenceViewModel and use EvidenceStatusBadge.
    const reviewedStart = ACTION_QUEUE_SRC.indexOf("reviewed.slice(0, 50)");
    const reviewedBlock = ACTION_QUEUE_SRC.slice(reviewedStart, reviewedStart + 800);
    expect(reviewedBlock).toContain("buildActionEvidenceViewModel");
    expect(reviewedBlock).toContain("EvidenceStatusBadge");
  });

  it("badge does not duplicate the long missing-evidence panel text", () => {
    // The compact badge label constants must be distinct from the panel help.
    expect(ACTION_QUEUE_SRC).not.toMatch(
      /action-queue-row-evidence-status.*Evidence details are not available/,
    );
    expect(ACTION_QUEUE_SRC).not.toMatch(
      /action-queue-row-evidence-status.*Review the diary timeline and sensor history before approving/,
    );
  });

  it("badge contains no unsafe automation or device-control language", () => {
    const banned = [
      /\bautopilot\b/i,
      /\bauto[-_ ]?execute\b/i,
      /\bdispatch[-_]?command\b/i,
      /\bexecute_action\b/i,
      /\brelay\.(on|off|toggle)/i,
      /\bactuator\.(send|trigger|run|fire)/i,
      /automatically (turn|run|trigger|dose|adjust)/i,
    ];
    for (const re of banned) {
      expect(ACTION_QUEUE_SRC).not.toMatch(re);
    }
  });

  it("badge surfaces no raw_payload / service_role / token / private-id strings", () => {
    expect(ACTION_QUEUE_SRC).not.toMatch(/raw_payload/i);
    expect(ACTION_QUEUE_SRC).not.toMatch(/service_role/i);
    expect(ACTION_QUEUE_SRC).not.toMatch(/Bearer\s+ey/i);
    expect(ACTION_QUEUE_SRC).not.toMatch(/sk_live_/i);
  });

  it("approval and rejection buttons are still present and unchanged", () => {
    expect(ACTION_QUEUE_SRC).toMatch(/onClick=\{\(\) => approve\(row\)\}/);
    expect(ACTION_QUEUE_SRC).toMatch(/onClick=\{\(\) => reject\(row\)\}/);
    expect(ACTION_QUEUE_SRC).toMatch(/onClick=\{\(\) => simulate\(row\)\}/);
  });

  it("badge uses aria-label and title for accessible help text without noisy duplication", () => {
    expect(ACTION_QUEUE_SRC).toMatch(/aria-label=\{\`Evidence: \$\{vm\.rowEvidenceStatusLabel\}\. \$\{vm\.rowEvidenceStatusHelp\}\`\}/);
    expect(ACTION_QUEUE_SRC).toMatch(/title=\{vm\.rowEvidenceStatusHelp\}/);
    expect(ACTION_QUEUE_SRC).toMatch(/<span className="sr-only">\{vm\.rowEvidenceStatusHelp\}<\/span>/);
  });
});

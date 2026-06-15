/**
 * Missing-evidence guidance link safety tests for Action Detail.
 *
 * - The pure helper returns a safe diary-timeline link only when a
 *   grow context is present; otherwise it returns null and the page
 *   falls back to the neutral missing-evidence help copy.
 * - The link uses the existing `timelinePath` route pattern and
 *   never invents a new route.
 * - Visible copy does not expose raw / internal IDs.
 * - `src/pages/ActionDetail.tsx` wires the helper next to the
 *   centralized missing-evidence help, gated on `!ev.hasSnapshotQuality`,
 *   and renders as an outline link (not an approval action).
 * - No Supabase fetch, no automation / device-control language, no
 *   raw_payload / service_role / token strings introduced.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildMissingEvidenceReviewLink,
  ACTION_EVIDENCE_REVIEW_LINK_LABEL,
  ACTION_EVIDENCE_REVIEW_LINK_ARIA_LABEL,
  ACTION_EVIDENCE_REVIEW_LINK_HELPER,
} from "@/lib/actionQueueMissingEvidenceLink";
import { timelinePath } from "@/lib/routes";

const ROOT = resolve(__dirname, "../..");
const ACTION_DETAIL_SRC = readFileSync(
  resolve(ROOT, "src/pages/ActionDetail.tsx"),
  "utf8",
);
const HELPER_SRC = readFileSync(
  resolve(ROOT, "src/lib/actionQueueMissingEvidenceLink.ts"),
  "utf8",
);

describe("buildMissingEvidenceReviewLink", () => {
  it("returns a diary-timeline link tied to grow context", () => {
    const link = buildMissingEvidenceReviewLink({
      grow_id: "grow-123",
      tent_id: "tent-1",
      plant_id: "plant-1",
    });
    expect(link).not.toBeNull();
    expect(link!.to).toBe(timelinePath("grow-123"));
    expect(link!.label).toBe(ACTION_EVIDENCE_REVIEW_LINK_LABEL);
    expect(link!.helper).toBe(ACTION_EVIDENCE_REVIEW_LINK_HELPER);
    expect(ACTION_EVIDENCE_REVIEW_LINK_ARIA_LABEL).toMatch(/review.*before approving/i);
  });

  it("uses the existing /timeline route pattern", () => {
    const link = buildMissingEvidenceReviewLink({ grow_id: "g-abc" });
    expect(link!.to.startsWith("/timeline")).toBe(true);
    expect(link!.to).toContain("growId=g-abc");
  });

  it("returns null when grow context is missing", () => {
    expect(buildMissingEvidenceReviewLink({})).toBeNull();
    expect(buildMissingEvidenceReviewLink({ grow_id: null })).toBeNull();
    expect(buildMissingEvidenceReviewLink({ grow_id: "" })).toBeNull();
    expect(buildMissingEvidenceReviewLink({ grow_id: "   " })).toBeNull();
  });

  it("returns null for non-string grow_id (defensive)", () => {
    // @ts-expect-error invalid input shape
    expect(buildMissingEvidenceReviewLink({ grow_id: 123 })).toBeNull();
  });

  it("visible copy is review-only and does not imply approval/automation", () => {
    expect(ACTION_EVIDENCE_REVIEW_LINK_LABEL).toMatch(/review|timeline/i);
    expect(ACTION_EVIDENCE_REVIEW_LINK_HELPER).toMatch(/before approving/i);
    const unsafe: RegExp[] = [
      /approve now/i,
      /auto[- ]?run/i,
      /turn (on|off)/i,
      /actuator/i,
      /relay/i,
    ];
    for (const re of unsafe) {
      expect(ACTION_EVIDENCE_REVIEW_LINK_LABEL).not.toMatch(re);
      expect(ACTION_EVIDENCE_REVIEW_LINK_HELPER).not.toMatch(re);
    }
  });

  it("visible copy does not embed raw/internal IDs", () => {
    const link = buildMissingEvidenceReviewLink({
      grow_id: "00000000-0000-0000-0000-000000000abc",
    });
    expect(link!.label).not.toMatch(/00000000/);
    expect(link!.helper).not.toMatch(/00000000/);
  });
});

describe("ActionDetail missing-evidence guidance wiring", () => {
  it("imports the helper", () => {
    expect(ACTION_DETAIL_SRC).toContain("buildMissingEvidenceReviewLink");
    expect(ACTION_DETAIL_SRC).toContain("@/lib/actionQueueMissingEvidenceLink");
  });

  it("renders the review-timeline link inside missing-evidence panels", () => {
    expect(ACTION_DETAIL_SRC).toContain(
      'data-testid={link.testId}',
    );
    // Gated on missing snapshot quality.
    const occurrences = ACTION_DETAIL_SRC.match(
      /!ev\.hasSnapshotQuality && \(\(\) => \{[\s\S]*?buildMissingEvidenceReviewLink/g,
    );
    expect(occurrences?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("renders the helper as an outline Link, not an approval Button", () => {
    expect(ACTION_DETAIL_SRC).toMatch(
      /variant="outline"[\s\S]{0,200}buildMissingEvidenceReviewLink|buildMissingEvidenceReviewLink[\s\S]{0,400}variant="outline"/,
    );
  });

  it("keeps centralized missing-evidence help copy alongside the link", () => {
    expect(ACTION_DETAIL_SRC).toContain("ACTION_EVIDENCE_MISSING_PANEL_HELP");
  });

  it("helper module does not introduce unsafe patterns", () => {
    const unsafe: RegExp[] = [
      /supabase/i,
      /service_role/i,
      /raw_payload/i,
      /Bearer\s+ey/i,
      /fetch\(/,
      /from\(/,
      /\.insert\(/,
      /\.update\(/,
      /\.delete\(/,
      /automatically (turn|run|trigger|dose|adjust)/i,
      /actuator/i,
    ];
    for (const re of unsafe) {
      expect(HELPER_SRC).not.toMatch(re);
    }
  });
});

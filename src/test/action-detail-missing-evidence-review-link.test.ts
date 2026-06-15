/**
 * Missing-evidence guidance link safety tests for Action Detail.
 *
 * Audit findings driving these tests:
 * - `src/lib/routes.ts` exposes `timelinePath(growId)` (grow-scoped
 *   `/timeline?growId=…`) plus `plantDetailPath(plantId)` and
 *   `tentDetailPath(tentId)` for the plant and tent detail pages.
 * - There is NO plant- or tent-scoped query param on the `/timeline`
 *   route (Timeline.tsx only resolves `?growId=`). The safest existing
 *   plant/tent destinations are therefore the plant and tent detail
 *   pages, which already render diary timeline + sensor snapshot
 *   sections scoped to that plant or tent.
 * - The helper prefers plant → tent → grow when those IDs are present,
 *   falling back safely without inventing routes.
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
  ACTION_EVIDENCE_REVIEW_SCOPE_LABELS,
} from "@/lib/actionQueueMissingEvidenceLink";
import {
  plantDetailPath,
  tentDetailPath,
  timelinePath,
} from "@/lib/routes";

const ROOT = resolve(__dirname, "../..");
const ACTION_DETAIL_SRC = readFileSync(
  resolve(ROOT, "src/pages/ActionDetail.tsx"),
  "utf8",
);
const HELPER_SRC = readFileSync(
  resolve(ROOT, "src/lib/actionQueueMissingEvidenceLink.ts"),
  "utf8",
);

describe("buildMissingEvidenceReviewLink — route preference", () => {
  it("prefers the plant detail page when plant_id is present (audit: plant detail renders plant-scoped diary + sensor sections)", () => {
    const link = buildMissingEvidenceReviewLink({
      grow_id: "grow-123",
      tent_id: "tent-1",
      plant_id: "plant-1",
    });
    expect(link).not.toBeNull();
    expect(link!.to).toBe(plantDetailPath("plant-1"));
    expect(link!.scope).toBe("plant");
    expect(link!.scopeLabel).toBe(ACTION_EVIDENCE_REVIEW_SCOPE_LABELS.plant);
  });

  it("prefers the tent detail page when plant_id is missing but tent_id is present (audit: tent detail renders tent-scoped timeline sections)", () => {
    const link = buildMissingEvidenceReviewLink({
      grow_id: "grow-123",
      tent_id: "tent-1",
      plant_id: null,
    });
    expect(link!.to).toBe(tentDetailPath("tent-1"));
    expect(link!.scope).toBe("tent");
    expect(link!.scopeLabel).toBe(ACTION_EVIDENCE_REVIEW_SCOPE_LABELS.tent);
  });

  it("falls back to the grow-scoped /timeline route when only grow_id is present (audit: Timeline.tsx only supports ?growId)", () => {
    const link = buildMissingEvidenceReviewLink({ grow_id: "g-abc" });
    expect(link!.to).toBe(timelinePath("g-abc"));
    expect(link!.to.startsWith("/timeline")).toBe(true);
    expect(link!.to).toContain("growId=g-abc");
    expect(link!.scope).toBe("grow");
  });

  it("does NOT invent a /timeline?plantId or ?tentId route (audit: those query params are not supported)", () => {
    const link = buildMissingEvidenceReviewLink({
      grow_id: "grow-123",
      tent_id: "tent-1",
      plant_id: "plant-1",
    });
    expect(link!.to).not.toMatch(/plantId=/);
    expect(link!.to).not.toMatch(/tentId=/);
    // Helper source must not reference unsupported query params either.
    expect(HELPER_SRC).not.toMatch(/plantId=/);
    expect(HELPER_SRC).not.toMatch(/tentId=/);
  });

  it("falls back through scopes when a more specific id is invalid", () => {
    expect(
      buildMissingEvidenceReviewLink({
        grow_id: "g1",
        tent_id: "t1",
        plant_id: "   ",
      })!.to,
    ).toBe(tentDetailPath("t1"));

    expect(
      buildMissingEvidenceReviewLink({
        grow_id: "g1",
        tent_id: "",
        plant_id: null,
      })!.to,
    ).toBe(timelinePath("g1"));
  });
});

describe("buildMissingEvidenceReviewLink — null safety", () => {
  it("returns null when no safe context is present", () => {
    expect(buildMissingEvidenceReviewLink({})).toBeNull();
    expect(
      buildMissingEvidenceReviewLink({
        grow_id: null,
        tent_id: null,
        plant_id: null,
      }),
    ).toBeNull();
    expect(
      buildMissingEvidenceReviewLink({
        grow_id: "",
        tent_id: "   ",
        plant_id: "",
      }),
    ).toBeNull();
  });

  it("returns null for non-string ids (defensive)", () => {
    // @ts-expect-error invalid input shape
    expect(buildMissingEvidenceReviewLink({ grow_id: 123 })).toBeNull();
    // @ts-expect-error invalid input shape
    expect(buildMissingEvidenceReviewLink({ plant_id: 42 })).toBeNull();
    expect(
      buildMissingEvidenceReviewLink(null as unknown as Parameters<typeof buildMissingEvidenceReviewLink>[0]),
    ).toBeNull();
  });
});

describe("buildMissingEvidenceReviewLink — visible copy + a11y", () => {
  it("label and helper stay review-only and never imply approval/automation", () => {
    expect(ACTION_EVIDENCE_REVIEW_LINK_LABEL).toBe("Review timeline");
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
      for (const scopeLabel of Object.values(ACTION_EVIDENCE_REVIEW_SCOPE_LABELS)) {
        expect(scopeLabel).not.toMatch(re);
      }
    }
  });

  it("aria-label is unchanged and review-focused", () => {
    expect(ACTION_EVIDENCE_REVIEW_LINK_ARIA_LABEL).toBe(
      "Review related diary timeline before approving",
    );
  });

  it("visible copy (label/helper/scopeLabel) does not embed raw/internal IDs", () => {
    const id = "00000000-0000-0000-0000-000000000abc";
    for (const ctx of [
      { plant_id: id },
      { tent_id: id },
      { grow_id: id },
    ]) {
      const link = buildMissingEvidenceReviewLink(ctx)!;
      expect(link.label).not.toContain(id);
      expect(link.helper).not.toContain(id);
      expect(link.scopeLabel).not.toContain(id);
      expect(link.scopeLabel).not.toMatch(/00000000/);
    }
  });
});

describe("ActionDetail missing-evidence guidance wiring", () => {
  it("imports the helper", () => {
    expect(ACTION_DETAIL_SRC).toContain("buildMissingEvidenceReviewLink");
    expect(ACTION_DETAIL_SRC).toContain("@/lib/actionQueueMissingEvidenceLink");
  });

  it("renders the review-timeline link inside missing-evidence panels", () => {
    expect(ACTION_DETAIL_SRC).toContain("data-testid={link.testId}");
    const occurrences = ACTION_DETAIL_SRC.match(
      /!ev\.hasSnapshotQuality && \(\(\) => \{[\s\S]*?buildMissingEvidenceReviewLink/g,
    );
    expect(occurrences?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("passes plant_id/tent_id/grow_id to the helper so plant/tent preference can apply", () => {
    expect(ACTION_DETAIL_SRC).toMatch(/plant_id:\s*row\.plant_id/);
    expect(ACTION_DETAIL_SRC).toMatch(/tent_id:\s*row\.tent_id/);
    expect(ACTION_DETAIL_SRC).toMatch(/grow_id:\s*row\.grow_id/);
  });

  it("renders the helper as an outline Link, not an approval Button", () => {
    expect(ACTION_DETAIL_SRC).toMatch(
      /variant="outline"[\s\S]{0,200}buildMissingEvidenceReviewLink|buildMissingEvidenceReviewLink[\s\S]{0,800}variant="outline"/,
    );
  });

  it("link has explicit aria-label with review/before-approving language", () => {
    expect(ACTION_DETAIL_SRC).toContain(
      "aria-label={ACTION_EVIDENCE_REVIEW_LINK_ARIA_LABEL}",
    );
    expect(ACTION_EVIDENCE_REVIEW_LINK_ARIA_LABEL).toMatch(/review.*diary.*timeline/i);
    expect(ACTION_EVIDENCE_REVIEW_LINK_ARIA_LABEL).toMatch(/before approving/i);
  });

  it("link aria-label does not use approval/action wording", () => {
    const unsafe: RegExp[] = [
      /approve now/i,
      /approve action/i,
      /auto[- ]?run/i,
      /turn (on|off)/i,
      /actuator/i,
      /relay/i,
      /submit/i,
    ];
    for (const re of unsafe) {
      expect(ACTION_EVIDENCE_REVIEW_LINK_ARIA_LABEL).not.toMatch(re);
    }
  });

  it("link renders as a Link component, not a button or submit", () => {
    const linkBlock = ACTION_DETAIL_SRC.match(
      /<Link[\s\S]*?aria-label=\{ACTION_EVIDENCE_REVIEW_LINK_ARIA_LABEL\}[\s\S]*?<\/Link>/,
    );
    expect(linkBlock).toBeTruthy();
    if (linkBlock) {
      expect(linkBlock[0]).not.toContain('type="submit"');
      expect(linkBlock[0]).not.toContain("onClick=");
    }
  });

  it("link uses existing focus-visible utility from Button asChild", () => {
    expect(ACTION_DETAIL_SRC).toContain('Button asChild size="sm" variant="outline"');
  });

  it("link does not steal focus on mount (no autoFocus)", () => {
    expect(ACTION_DETAIL_SRC).not.toMatch(/autoFocus[\s\S]*?buildMissingEvidenceReviewLink/);
    expect(ACTION_DETAIL_SRC).not.toMatch(
      /autoFocus[\s\S]{0,200}action-detail-evidence-review-link/,
    );
  });

  it("keeps centralized missing-evidence help copy alongside the link", () => {
    expect(ACTION_DETAIL_SRC).toContain("ACTION_EVIDENCE_MISSING_PANEL_HELP");
  });

  it("groups missing-evidence chip, help, and link in a responsive vertical stack", () => {
    expect(ACTION_DETAIL_SRC).toContain('data-testid="action-detail-missing-evidence-group"');
    expect(ACTION_DETAIL_SRC).toMatch(/flex flex-col gap-2[\s\S]{0,400}action-detail-missing-evidence-group/);
  });

  it("stacks review link and helper text on mobile and keeps them inline on desktop", () => {
    expect(ACTION_DETAIL_SRC).toMatch(
      /flex-col gap-1\.5 sm:flex-row sm:items-center sm:gap-2/,
    );
  });

  it("review link uses a thumb-friendly minimum touch target on mobile", () => {
    expect(ACTION_DETAIL_SRC).toContain("min-h-[2.25rem]");
  });

  it("review link spans full width on mobile and auto on desktop", () => {
    expect(ACTION_DETAIL_SRC).toContain("w-full sm:w-auto");
  });

  it("review link stays inside missing-evidence context, separated from approval controls", () => {
    const missingGroup = ACTION_DETAIL_SRC.match(
      /data-testid="action-detail-missing-evidence-group"[\s\S]*?<\/div>/g,
    );
    expect(missingGroup).toBeTruthy();
    expect(missingGroup![0]).toContain("action-detail-evidence-review-link");
    expect(missingGroup![0]).not.toMatch(/approve|reject/i);
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

  it("ActionDetail source does not expose raw IDs, tokens, or automation language", () => {
    const unsafe: RegExp[] = [
      /raw_payload/i,
      /service_role/i,
      /Bearer\s+ey/i,
      /actuator/i,
      /auto[- ]?run/i,
      /turn (on|off)/i,
      /relay/i,
    ];
    for (const re of unsafe) {
      expect(ACTION_DETAIL_SRC).not.toMatch(re);
    }
  });

  it("approval and rejection controls are unchanged", () => {
    expect(ACTION_DETAIL_SRC).toMatch(/<Button[\s\S]*?gradient-leaf[\s\S]*?Approve/);
    expect(ACTION_DETAIL_SRC).toMatch(/<Button[\s\S]*?Reject/);
  });
});

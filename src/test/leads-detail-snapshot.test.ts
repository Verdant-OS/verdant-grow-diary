/**
 * Tests for the read-only Lead Detail Snapshot Card.
 *
 * Covers complete leads, missing name fallback, unknown source/type/status,
 * invalid created_at, compatibility with leadNextActionRules /
 * leadQualityScoreRules / leadActivityRules, deterministic repeatability,
 * and the empty/fallback snapshot.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildLeadDetailSnapshot } from "@/lib/leadDetailSnapshotRules";
import { recommendNextAction } from "@/lib/leadNextActionRules";
import { scoreLeadQuality } from "@/lib/leadQualityScoreRules";
import { buildLeadActivityTimeline } from "@/lib/leadActivityRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const RULES = readSrc("lib/leadDetailSnapshotRules.ts");
const COMPONENT = readSrc("components/LeadDetailSnapshotCard.tsx");
import { readLeadDetailDrawerBundle } from "./_leadDrawerBundle";
const DRAWER = readLeadDetailDrawerBundle();

const NOW = new Date("2026-05-10T12:00:00Z").getTime();

function lead(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "lead-x",
    created_at: "2026-05-09T12:00:00Z",
    updated_at: null,
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines",
    role: "Founder",
    lead_type: "investor",
    source: "landing",
    message: "Interested in beta",
    status: "new",
    operator_notes: null,
    contacted_at: null,
    follow_up_at: null,
    ...over,
  };
}

describe("buildLeadDetailSnapshot — happy path", () => {
  it("returns a complete snapshot for a healthy lead", () => {
    const s = buildLeadDetailSnapshot(lead(), NOW);
    expect(s.isFallback).toBe(false);
    expect(s.displayName).toBe("Ada Lovelace");
    expect(s.statusKnown).toBe(true);
    expect(s.sourceKnown).toBe(true);
    expect(s.leadTypeKnown).toBe(true);
    expect(s.createdValid).toBe(true);
    expect(s.createdLabel).toBe("2026-05-09");
    expect(s.warnings).toEqual([]);
  });
});

describe("buildLeadDetailSnapshot — safety", () => {
  it("falls back to email when name is missing", () => {
    const s = buildLeadDetailSnapshot(
      lead({ name: null }),
      NOW,
    );
    expect(s.displayName).toBe("ada@example.com");
  });

  it("falls back to 'Unknown lead' when name and email are missing", () => {
    const s = buildLeadDetailSnapshot(
      lead({ name: null, email: "" as unknown as string }),
      NOW,
    );
    expect(s.displayName).toBe("Unknown lead");
  });

  it("clearly labels unknown source/type/status without hiding them", () => {
    const s = buildLeadDetailSnapshot(
      lead({
        status: "weird" as unknown as LeadRow["status"],
        source: "   ",
        lead_type: "",
      }),
      NOW,
    );
    expect(s.statusKnown).toBe(false);
    expect(s.sourceKnown).toBe(false);
    expect(s.leadTypeKnown).toBe(false);
    expect(s.status).toBe("unknown");
    expect(s.source).toBe("unknown");
    expect(s.leadType).toBe("unknown");
    expect(s.warnings.join(" ")).toMatch(/status/i);
    expect(s.warnings.join(" ")).toMatch(/source/i);
    expect(s.warnings.join(" ")).toMatch(/lead type/i);
  });

  it("flags an invalid created_at safely", () => {
    const s = buildLeadDetailSnapshot(
      lead({ created_at: "not-a-date" }),
      NOW,
    );
    expect(s.createdValid).toBe(false);
    expect(s.createdLabel).toMatch(/Invalid|Unknown/);
    expect(s.warnings.join(" ")).toMatch(/created_at/);
  });

  it("returns a safe fallback snapshot for null/undefined input", () => {
    const s = buildLeadDetailSnapshot(null, NOW);
    expect(s.isFallback).toBe(true);
    expect(s.displayName).toBe("No lead selected");
    expect(s.statusKnown).toBe(false);
    expect(s.warnings.join(" ")).toMatch(/No lead selected/);
  });
});

describe("buildLeadDetailSnapshot — compatibility with rule modules", () => {
  it("delegates next action to recommendNextAction", () => {
    const l = lead({
      status: "follow_up",
      follow_up_at: "2026-05-05T12:00:00Z",
    });
    const s = buildLeadDetailSnapshot(l, NOW);
    expect(s.nextAction).toEqual(recommendNextAction(l, NOW));
  });

  it("delegates quality scoring to scoreLeadQuality", () => {
    const l = lead({
      status: "contacted",
      contacted_at: "2026-05-10T10:00:00Z",
      operator_notes: "x",
    });
    const s = buildLeadDetailSnapshot(l, NOW);
    expect(s.quality).toEqual(scoreLeadQuality(l, NOW));
  });

  it("matches activity timeline length from buildLeadActivityTimeline", () => {
    const l = lead({
      status: "closed",
      operator_notes: "won",
      contacted_at: "2026-05-09T08:00:00Z",
      follow_up_at: "2026-05-12T08:00:00Z",
    });
    const s = buildLeadDetailSnapshot(l, NOW);
    expect(s.activityCount).toBe(buildLeadActivityTimeline(l).length);
  });
});

describe("buildLeadDetailSnapshot — determinism", () => {
  it("produces identical output across repeated calls", () => {
    const l = lead({
      status: "follow_up",
      follow_up_at: "2026-05-05T12:00:00Z",
    });
    const a = buildLeadDetailSnapshot(l, NOW);
    const b = buildLeadDetailSnapshot(l, NOW);
    expect(a).toEqual(b);
  });
});

describe("wiring and safety contracts", () => {
  it("LeadDetailSnapshotCard is mounted at the top of LeadDetailDrawer", () => {
    expect(DRAWER).toMatch(/LeadDetailSnapshotCard/);
    expect(DRAWER).toMatch(/from "@\/components\/LeadDetailSnapshotCard"/);
    // Must appear before next action / quality / timeline in source order.
    const idxSnap = DRAWER.indexOf("LeadDetailSnapshotCard");
    const idxNext = DRAWER.indexOf("LeadNextActionPanel");
    const idxQuality = DRAWER.indexOf("LeadQualityScoreBadge");
    const idxTimeline = DRAWER.indexOf("LeadActivityTimeline");
    // imports may appear first; the JSX mount of the snapshot should still
    // precede the JSX mounts of the others — assert against last index.
    expect(idxSnap).toBeGreaterThan(-1);
    expect(idxSnap).toBeLessThan(DRAWER.lastIndexOf("LeadNextActionPanel"));
    expect(idxSnap).toBeLessThan(DRAWER.lastIndexOf("LeadQualityScoreBadge"));
    expect(idxSnap).toBeLessThan(DRAWER.lastIndexOf("LeadActivityTimeline"));
    expect(idxNext).toBeGreaterThan(-1);
    expect(idxQuality).toBeGreaterThan(-1);
    expect(idxTimeline).toBeGreaterThan(-1);
  });

  for (const [name, blob] of [
    ["rules", RULES],
    ["component", COMPONENT],
  ] as const) {
    it(`${name} has no forbidden strings`, () => {
      expect(blob).not.toMatch(/service_role/);
      expect(blob).not.toMatch(/\bwebhook\b/i);
      expect(blob).not.toMatch(/\bSMS\b/);
      expect(blob).not.toMatch(/send[-_ ]?email/i);
      expect(blob).not.toMatch(/mailgun|sendgrid|twilio|resend\.com/i);
      expect(blob).not.toMatch(/from "@\/integrations\/supabase/);
    });
  }
});

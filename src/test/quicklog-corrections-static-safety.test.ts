/**
 * Quick Log Corrections & Retractions v1 — static safety fences (issue #786).
 *
 * Source-text assertions that lock the safety posture:
 *  1. No hard-delete path anywhere in the new modules or the migration.
 *  2. The revision ledger has zero client write policies and anon is revoked.
 *  3. Both RPCs are SECURITY DEFINER, pin search_path, and derive identity
 *     from auth.uid() — never from a client-supplied user id.
 *  4. No entitlement/plan/tier gate exists on the correction/retraction
 *     path — the feature is identical for Free, Pro, Craft, and Founder.
 *  5. Every reconciled operational reader filters retracted diary rows at
 *     the query (including head:true counts and both edge functions).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const MIGRATION = "supabase/migrations/20260811090000_quicklog_corrections_retractions.sql";

const NEW_MODULES = [
  "src/lib/quick-log/quickLogRevisionRules.ts",
  "src/lib/quickLogRevisionService.ts",
  "src/lib/quickLogRevisionInvalidationRules.ts",
  "src/hooks/useQuickLogRevisionBadges.ts",
  "src/hooks/useRetractedQuickLogEntries.ts",
  "src/components/QuickLogEntryIntegrityControls.tsx",
  "src/components/RetractedQuickLogPanel.tsx",
];

describe("no hard-delete path", () => {
  it("new client modules never call .delete( or DELETE FROM", () => {
    for (const rel of NEW_MODULES) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/\.delete\(/);
      expect(src, rel).not.toMatch(/DELETE\s+FROM/i);
    }
  });

  it("the migration never deletes or drops grower data", () => {
    const sql = read(MIGRATION);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.(diary_entries|grow_events)/i);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
  });
});

describe("revision ledger write posture", () => {
  it("has SELECT-only policies and no client INSERT/UPDATE/DELETE policy", () => {
    const sql = read(MIGRATION);
    const policyStatements =
      sql.match(/CREATE POLICY[\s\S]*?;/g)?.filter((p) => p.includes("quicklog_entry_revisions")) ??
      [];
    expect(policyStatements.length).toBeGreaterThanOrEqual(2);
    for (const policy of policyStatements) {
      expect(policy).toMatch(/FOR\s+SELECT/i);
      expect(policy).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE|ALL)/i);
    }
  });

  it("revokes anon and PUBLIC on the ledger and both RPCs", () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/REVOKE ALL ON public\.quicklog_entry_revisions FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON public\.quicklog_entry_revisions FROM anon/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.quicklog_retract_entry[\s\S]{0,120}FROM PUBLIC, anon/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.quicklog_correct_entry[\s\S]{0,120}FROM PUBLIC, anon/,
    );
  });

  it("both RPCs are SECURITY DEFINER, pin search_path, and use auth.uid()", () => {
    const sql = read(MIGRATION);
    for (const fn of ["quicklog_retract_entry", "quicklog_correct_entry"]) {
      const idx = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`);
      expect(idx, fn).toBeGreaterThan(-1);
      const body = sql.slice(idx, idx + 2000);
      expect(body, fn).toMatch(/SECURITY DEFINER/);
      expect(body, fn).toMatch(/SET search_path TO 'public', 'pg_temp'/);
      expect(body, fn).toMatch(/uid UUID := auth\.uid\(\)/);
    }
  });

  it("RPCs never accept a client-supplied user id", () => {
    const sql = read(MIGRATION);
    expect(sql).not.toMatch(/p_user_id/i);
  });
});

describe("no entitlement gate on the correction/retraction path", () => {
  it("new modules contain no plan/tier/entitlement checks", () => {
    for (const rel of NEW_MODULES) {
      const src = read(rel);
      // Gate *code*, not prose: imports of the entitlements layer, capability
      // calls, paywall components, or literal plan/tier comparisons.
      expect(src, rel).not.toMatch(/from "@\/lib\/entitlements/);
      expect(src, rel).not.toMatch(/canUseCapability\s*\(/);
      expect(src, rel).not.toMatch(/PaywallCta/);
      expect(src, rel).not.toMatch(/profiles\.tier/);
      expect(src, rel).not.toMatch(/from\("subscriptions"\)|from\("billing_subscriptions"\)/);
      expect(src, rel).not.toMatch(/plan\s*===|tier\s*===/);
    }
  });

  it("the migration references no billing tables", () => {
    const sql = read(MIGRATION);
    expect(sql).not.toMatch(/subscriptions|billing|entitlement|profiles/i);
  });
});

describe("operational readers exclude retracted diary rows at the query", () => {
  const RECONCILED_READERS: Array<[string, number]> = [
    ["src/pages/Timeline.tsx", 2],
    ["src/hooks/useTimelineMemory.ts", 2],
    ["src/hooks/useQuickLogGroupedTimeline.ts", 2],
    ["src/hooks/usePlantRecentActivity.ts", 1],
    ["src/hooks/usePlantLogDays.ts", 1],
    ["src/hooks/useManualSnapshotTimelineCards.ts", 2],
    ["src/hooks/usePlantManualSensorHistory.ts", 1],
    ["src/hooks/useLatestSensorSnapshot.ts", 1],
    ["src/hooks/useEnvironmentTrends.ts", 1],
    ["src/hooks/useDashboardScopedData.ts", 1],
    ["src/hooks/useGrowDetailData.ts", 3],
    ["src/hooks/useTentPlantRosterActivity.ts", 1],
    ["src/hooks/use-diary-entries.ts", 1],
    ["src/lib/db.ts", 1],
    ["src/hooks/useDiaryRangeReportData.ts", 1],
    ["src/hooks/useReportsHubData.ts", 3],
    ["src/hooks/usePostGrowLearningReportData.ts", 1],
    ["src/hooks/useOneTentActivationEvidence.ts", 1],
    ["src/hooks/usePhenoEvidenceCaptureContext.ts", 1],
    ["src/lib/phenoEvidenceReceiptService.ts", 1],
    ["src/hooks/useRecentFeedingsForDefaults.ts", 1],
    ["src/components/PlantSensorSourceBreakdownCard.tsx", 1],
    ["src/lib/actionFollowUpExistingPhotoService.ts", 1],
    ["supabase/functions/ai-coach/index.ts", 1],
    ["supabase/functions/mcp/index.ts", 1],
  ];

  it.each(RECONCILED_READERS)("%s filters retracted rows (>= %d sites)", (rel, minCount) => {
    const src = read(rel);
    const matches = src.match(/\.is\("retracted_at", null\)/g) ?? [];
    expect(matches.length, rel).toBeGreaterThanOrEqual(minCount);
  });

  it("the pheno receipt parser rejects retracted rows", () => {
    const src = read("src/lib/phenoEvidenceCaptureRules.ts");
    expect(src).toMatch(/retracted_at/);
  });

  it("the reports-hub exact counts carry the filter (head:true cannot be filtered in memory)", () => {
    const src = read("src/hooks/useReportsHubData.ts");
    const countBlocks = src.match(
      /select\("id", \{ count: "exact", head: true \}\)[\s\S]{0,200}?\.is\("retracted_at", null\)/g,
    );
    expect(countBlocks?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("existing non-Quick-Log controls are not redefined", () => {
  it("EntryEditDialog and DiaryEntryRemoveButton do not import revision modules", () => {
    for (const rel of [
      "src/components/EntryEditDialog.tsx",
      "src/components/DiaryEntryRemoveButton.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/quickLogRevision|QuickLogEntryIntegrity/);
    }
  });
});

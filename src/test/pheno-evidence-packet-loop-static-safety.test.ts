/**
 * Static safety for the Pheno Evidence Packet Loop slice.
 *
 * Proves the integration wiring exists AND that the slice adds no ranking,
 * no automatic selection, no Action Queue writes, no device control, no
 * service_role, no schema/SQL, and no second Quick Log save path.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const NEW_FILES = [
  "src/lib/phenoEvidencePacket.ts",
  "src/lib/phenoEvidenceReceiptService.ts",
  "src/hooks/usePhenoEvidencePackets.ts",
  "src/lib/phenoEvidenceQuickLogPrefill.ts",
  "src/components/PhenoCandidateEvidenceCoverage.tsx",
];

describe("packet-loop slice — safety fences", () => {
  it("no ranking / winner / automatic-selection language in code", () => {
    for (const f of NEW_FILES) {
      const code = strip(read(f)).toLowerCase();
      expect(code, f).not.toMatch(/\bwinner\b|\brank(ing|ed)?\b|best candidate|auto[_-]?select/);
    }
  });

  it("no service_role, Action Queue writes, or device control", () => {
    for (const f of NEW_FILES) {
      const code = strip(read(f));
      expect(code, f).not.toMatch(/service[_-]?role/i);
      expect(code, f).not.toMatch(/action_queue|actionQueue/);
      expect(code, f).not.toMatch(/device[_-]?control|device_command|\bmqtt\b/i);
    }
  });

  it("read-only slice: no insert/upsert/update/delete anywhere in the new files", () => {
    for (const f of NEW_FILES) {
      const code = strip(read(f));
      expect(code, f).not.toMatch(/\.(insert|upsert|update|delete)\(/);
    }
  });

  it("no schema/migration/RPC surface: service reads diary_entries only", () => {
    const svc = strip(read("src/lib/phenoEvidenceReceiptService.ts"));
    const fromTables = [...svc.matchAll(/\.from\(["']([^"']+)["']\)/g)].map((m) => m[1]);
    expect(fromTables).toEqual(["diary_entries"]);
    expect(svc).not.toMatch(/\.rpc\(/);
  });

  it("bounded read: hard caps and stable ordering are present", () => {
    const svc = read("src/lib/phenoEvidenceReceiptService.ts");
    expect(svc).toMatch(/PHENO_EVIDENCE_PACKET_MAX_PLANT_IDS = 60/);
    expect(svc).toMatch(/PHENO_EVIDENCE_PACKET_ROW_CAP = 1000/);
    expect(svc).toMatch(/\.order\("entry_at", \{ ascending: false \}\)/);
    expect(svc).toMatch(/\.order\("id", \{ ascending: true \}\)/);
    expect(svc).toMatch(/\.limit\(PHENO_EVIDENCE_PACKET_ROW_CAP\)/);
  });

  it("hook keys under the pheno_evidence_receipts family Quick Log invalidates", () => {
    expect(read("src/hooks/usePhenoEvidencePackets.ts")).toMatch(
      /queryKey: \["pheno_evidence_receipts", "packets", huntId, idsKey\]/,
    );
    expect(read("src/lib/quickLogV2RefreshRules.ts")).toMatch(/\["pheno_evidence_receipts"\]/);
  });
});

describe("packet-loop slice — Quick Log bridge stays single-path", () => {
  const quickLog = read("src/components/QuickLog.tsx");

  it("the explicit-goal reset effect is intact", () => {
    expect(quickLog).toMatch(
      /setSelectedPhenoEvidenceGoal\(null\);\s*\}, \[open, plantId, selectedPhenoHuntId\]\)/,
    );
  });

  it("the prefill seed is guarded by plant, hunt, ready context, and configured goal", () => {
    expect(quickLog).toMatch(/selectedPlant\?\.id !== prefill\.plantId\) return;/);
    expect(quickLog).toMatch(/selectedPhenoHuntId !== prefill\.phenoHuntId\) return;/);
    expect(quickLog).toMatch(
      /phenoEvidenceContext\.status !== "ready" \|\| !phenoEvidenceContext\.context\) return;/,
    );
    expect(quickLog).toMatch(/coverage\.goals\.some\(\(g\) => g\.id === goal\);\s*if \(!configured\) return;/);
  });

  it("save-time revalidation against live configured goals is intact", () => {
    expect(quickLog).toMatch(/coverage\.goals\.some\(\s*\(goal\) => goal\.id === selectedPhenoEvidenceGoal/);
  });

  it("the coverage presenter dispatches the EXISTING prefill event, no new modal/route", () => {
    const src = read("src/components/PhenoCandidateEvidenceCoverage.tsx");
    expect(src).toMatch(/PLANT_QUICKLOG_PREFILL_EVENT/);
    expect(src).not.toMatch(/createPortal|<Dialog|useNavigate|<Route/);
  });
});

describe("packet-loop slice — surfaces wired", () => {
  it("workspace shows coverage separately from readiness and exports honestly", () => {
    const page = read("src/pages/PhenoHuntWorkspace.tsx");
    expect(page).toMatch(/usePhenoEvidencePackets/);
    expect(page).toMatch(/PhenoCandidateEvidenceCoverage/);
    expect(page).toMatch(/CandidateReadinessBadge/); // readiness axis untouched
    expect(page).toMatch(/evidencePacketsByPlant: evidencePackets\.packets/);
    // Scope honesty: active filters withhold the (filtered) total so the CSV
    // can never claim complete_hunt for a filtered page export.
    expect(page).toMatch(/\?\s*null\s*:\s*ws\.totalCandidateCount/);
  });

  it("compare page renders read-only coverage for the compared cohort", () => {
    const page = read("src/pages/PhenoHuntCompare.tsx");
    expect(page).toMatch(/usePhenoEvidencePackets/);
    expect(page).toMatch(/allowRecordActions=\{false\}/);
    expect(page).toMatch(/restrictCohortToHunt/); // cohort isolation intact
  });

  it("CSV export carries the new traceability columns", () => {
    const csv = read("src/lib/phenoHuntCsvExport.ts");
    for (const col of [
      "configured_goal_count",
      "recorded_goal_count",
      "missing_goal_ids",
      "latest_manual_evidence_at",
      "manual_receipt_count",
      "manual_evidence_status",
      "manual_evidence_truncated",
      "export_scope",
      "loaded_candidate_count",
      "total_candidate_count",
    ]) {
      expect(csv).toContain(`"${col}"`);
    }
    // Scope honesty: complete only when loaded === known total.
    expect(csv).toMatch(/loadedCount === input\.totalCandidateCount\s*\?\s*"complete_hunt"/);
  });
});

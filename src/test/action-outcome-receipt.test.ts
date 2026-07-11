/**
 * Post-Action Outcome Analysis — receipt serialization + compact summary
 * + report view model + static architecture guards.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import {
  ACTION_OUTCOME_SUMMARY_JSON_PREFIX,
  buildActionOutcomeCompactSummary,
  renderActionOutcomeSummaryLine,
  serializeActionOutcomeReceipt,
} from "@/lib/actionOutcomeReceipt";
import { buildActionOutcomeReportViewModel } from "@/lib/actionOutcomeReportViewModel";
import { analyzeActionOutcomeFromRows } from "@/lib/actionOutcomeEvidenceCompiler";
import type { ActionOutcomeAnalysisReceipt } from "@/lib/actionOutcomeAnalysisTypes";

const ROOT = resolve(__dirname, "../..");

function receipt(): ActionOutcomeAnalysisReceipt {
  const r = analyzeActionOutcomeFromRows({
    action: {
      id: "aq-1",
      status: "completed",
      completed_at: "2026-07-10T12:00:00.000Z",
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: null,
      action_type: "environment_adjustment",
      target_metric: "vpd_kpa",
      suggested_change: "Increase airflow",
      reason: "VPD above target",
    },
    followUpEntries: [
      {
        id: "entry-a",
        details: {
          event_type: "action_followup",
          action_queue_id: "aq-1",
          outcome: "improved",
          observed_at: "2026-07-11T00:00:00.000Z",
          note: "Looks better",
        },
      },
    ],
    sensorRows: [
      {
        tent_id: "tent-1",
        metric: "temperature_c",
        value: 32,
        captured_at: "2026-07-10T06:00:00.000Z",
        source: "live",
        quality: "ok",
      },
      {
        tent_id: "tent-1",
        metric: "temperature_c",
        value: 26,
        captured_at: "2026-07-10T18:00:00.000Z",
        source: "live",
        quality: "ok",
      },
    ],
    diaryRows: [],
    growTargets: {
      grow_id: "grow-1",
      temp_min: 20,
      temp_max: 28,
      rh_min: 40,
      rh_max: 60,
      vpd_min: 0.8,
      vpd_max: 1.6,
      soil_wc_min: null,
      soil_wc_max: null,
      soil_ec_min: null,
      soil_ec_max: null,
      ppfd_min: null,
      ppfd_max: null,
    },
    analysisAt: "2026-07-11T12:00:00.000Z",
  });
  if (!r.ok) throw new Error("fixture receipt failed");
  return r.receipt;
}

describe("receipt schema + serialization", () => {
  it("required schema fields exist with stable schema version", () => {
    const r = receipt();
    expect(r.schemaVersion).toBe("1");
    for (const key of [
      "actionQueueId",
      "classification",
      "confidenceScore",
      "confidenceLevel",
      "riskLevel",
      "growerReportedOutcome",
      "evidenceAgreement",
      "summary",
      "metricComparisons",
      "supportingEvidence",
      "conflictingEvidence",
      "missingInformation",
      "cautions",
      "repeatNextRun",
      "avoidNextRun",
      "evidenceWindow",
    ]) {
      expect(r).toHaveProperty(key);
    }
  });

  it("serializes with 2-space formatting, trailing newline, stable key order", () => {
    const text = serializeActionOutcomeReceipt(receipt());
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('  "schemaVersion": "1"');
    const parsed = JSON.parse(text);
    expect(Object.keys(parsed)[0]).toBe("schemaVersion");
    expect(Object.keys(parsed)).toEqual([
      "schemaVersion",
      "actionQueueId",
      "classification",
      "confidenceScore",
      "confidenceLevel",
      "riskLevel",
      "growerReportedOutcome",
      "evidenceAgreement",
      "summary",
      "metricComparisons",
      "supportingEvidence",
      "conflictingEvidence",
      "missingInformation",
      "cautions",
      "repeatNextRun",
      "avoidNextRun",
      "evidenceWindow",
    ]);
  });

  it("serialization is byte-identical for the same receipt and arrays are deterministic", () => {
    expect(serializeActionOutcomeReceipt(receipt())).toBe(serializeActionOutcomeReceipt(receipt()));
  });

  it("contains no undefined values and JSON round-trips", () => {
    const text = serializeActionOutcomeReceipt(receipt());
    expect(text).not.toContain("undefined");
    const parsed = JSON.parse(text);
    expect(parsed.actionQueueId).toBe("aq-1");
  });

  it("contains no user IDs, tokens, signed URLs, or raw payloads", () => {
    const text = serializeActionOutcomeReceipt(receipt());
    expect(text).not.toMatch(/user_id|userId/);
    expect(text).not.toMatch(/Bearer|token|apikey/i);
    expect(text).not.toMatch(/https?:\/\/[^"]*(sign|token)/i);
    expect(text).not.toMatch(/raw_payload|rawPayload/);
  });
});

describe("compact operator summary", () => {
  it("parses and carries the required compact fields", () => {
    const line = renderActionOutcomeSummaryLine(receipt());
    expect(line.startsWith(ACTION_OUTCOME_SUMMARY_JSON_PREFIX)).toBe(true);
    expect(line).not.toContain("\n");
    const parsed = JSON.parse(line.slice(ACTION_OUTCOME_SUMMARY_JSON_PREFIX.length));
    expect(parsed.schema_version).toBe("1");
    expect(parsed.metric_counts).toEqual({
      improved: 1,
      declined: 0,
      unchanged: 0,
      not_comparable: 0,
    });
    expect(typeof parsed.missing_information_count).toBe("number");
  });

  it("contains no private evidence — only counts and enums", () => {
    const summary = buildActionOutcomeCompactSummary(receipt());
    const text = JSON.stringify(summary);
    expect(text).not.toMatch(/tent-1|grow-1|Looks better|Increase airflow/);
  });
});

describe("report view model", () => {
  it("projects the receipt without re-deciding anything", () => {
    const r = receipt();
    const vm = buildActionOutcomeReportViewModel(r);
    expect(vm.title).toBe("Post-action outcome analysis");
    expect(vm.classificationLabel).toBe("Evidence improved");
    expect(vm.growerOutcomeLabel).toBe("Improved");
    expect(vm.agreementLabel).toBe("Grower and evidence agree");
    expect(vm.metrics).toHaveLength(r.metricComparisons.length);
    expect(vm.metrics[0].metricLabel).toBe("Temperature (°F)");
    expect(vm.summary).toBe(r.summary);
  });

  it("handles a missing grower outcome with a null label", () => {
    const r = { ...receipt(), growerReportedOutcome: null };
    expect(buildActionOutcomeReportViewModel(r).growerOutcomeLabel).toBeNull();
  });
});

describe("static architecture", () => {
  const ENGINE_FILES = [
    "src/lib/actionOutcomeAnalysisTypes.ts",
    "src/lib/actionOutcomeWindowRules.ts",
    "src/lib/actionOutcomeEvidenceRules.ts",
    "src/lib/actionOutcomeEvidenceCompiler.ts",
    "src/lib/actionOutcomeAnalysisEngine.ts",
    "src/lib/actionOutcomeConfidenceRules.ts",
    "src/lib/actionOutcomeReceipt.ts",
    "src/lib/actionOutcomeReportViewModel.ts",
    "src/lib/actionOutcomeAnalysisService.ts",
  ];

  it("no React, AI-provider, device-control, or admin-cleanup imports in engine files", () => {
    for (const file of ENGINE_FILES) {
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(src, `${file} must not import React`).not.toMatch(/from ["']react["']/);
      expect(src, `${file} must not call AI providers`).not.toMatch(
        /openai|anthropic|generativelanguage|mistral|groq/i,
      );
      expect(src, `${file} must not touch devices`).not.toMatch(
        /mqtt|device[-_]?command|actuator/i,
      );
      expect(src, `${file} must not import admin cleanup`).not.toMatch(
        /plant-photos-cleanup|admin\//,
      );
      expect(src, `${file} must not use service role`).not.toMatch(
        /SUPABASE_SERVICE_ROLE_KEY|service_role/,
      );
    }
  });

  it("engine performs no writes: no insert/update/delete/upsert calls anywhere", () => {
    for (const file of ENGINE_FILES) {
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(src, `${file} must be read-only`).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    }
  });

  it("no Lovable active files are modified by this build (git diff clean)", () => {
    const activeFiles = [
      "src/components/ActionFollowUpEvidenceForm.tsx",
      "src/components/ActionFollowUpEvidenceCard.tsx",
      "src/components/ActionFollowUpEvidenceSection.tsx",
      "src/pages/ActionDetail.tsx",
      "src/lib/actionFollowUpManualSensorRules.ts",
      "src/lib/actionFollowUpManualSensorService.ts",
      "src/components/ActionFollowUpManualSensorSelector.tsx",
      "src/components/ActionFollowUpManualSensorEvidence.tsx",
      "src/test/action-follow-up-manual-sensor.test.tsx",
    ];
    const diff = execSync("git diff --name-only HEAD~0", { cwd: ROOT, encoding: "utf8" });
    const staged = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
    for (const f of activeFiles) {
      expect(diff, `${f} must stay untouched`).not.toContain(f);
      expect(staged, `${f} must stay untouched`).not.toContain(f);
    }
  });

  it("no schema/migration/Edge Function changes in this build", () => {
    const status = execSync("git status --porcelain supabase/", { cwd: ROOT, encoding: "utf8" });
    expect(status.trim()).toBe("");
  });

  it("no product code imports the outcome engine yet (report-only until integration)", () => {
    const grep = execSync(
      "grep -rl \"actionOutcomeAnalysisEngine\\|actionOutcomeEvidenceCompiler\" src --include='*.tsx' | grep -v '/test/' || true",
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(grep.trim()).toBe("");
  });

  it("no scheduler / cron / background jobs introduced", () => {
    for (const file of ENGINE_FILES) {
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(src).not.toMatch(/setInterval\s*\(|node-cron|cron\.schedule/);
    }
  });

  it("engine files exist exactly where the architecture says", () => {
    for (const file of ENGINE_FILES) {
      expect(existsSync(join(ROOT, file)), `${file} missing`).toBe(true);
    }
  });
});

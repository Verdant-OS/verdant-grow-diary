/**
 * Tests for the centralized Action Queue evidence provenance view-model.
 *
 * Hard guarantees verified here:
 *  - Alert-derived and AI Doctor-derived rows produce calm, grower-safe copy.
 *  - Unknown origin falls back to "Review evidence".
 *  - Unknown alert type falls back to "Environment alert".
 *  - Missing sanitized snapshot metrics return the neutral unavailable copy.
 *  - When sanitized historical metrics are attached, classification runs in
 *    historical mode and never claims current-room support.
 *  - The view-model output exposes no raw_payload / service_role / token /
 *    private/internal-id strings.
 */

import { describe, it, expect } from "vitest";
import {
  buildActionEvidenceViewModel,
  ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL,
  ACTION_EVIDENCE_REVIEW_ONLY_LABEL,
  ACTION_EVIDENCE_NO_AUTOMATION_NOTE,
  ACTION_EVIDENCE_HISTORICAL_NOTE,
  ACTION_EVIDENCE_ORIGIN_FALLBACK,
  classifyManualSensorSnapshotQuality,
} from "@/lib/actionQueueEvidenceViewModel";

const NOW = Date.parse("2026-06-15T12:00:00.000Z");

describe("buildActionEvidenceViewModel", () => {
  it("formats alert-derived action provenance with a friendly alert label", () => {
    const vm = buildActionEvidenceViewModel(
      {
        source: "environment_alert",
        action_type: "review_high_vpd",
        alert_type: "high_vpd",
        captured_at: "2026-06-14T08:30:00.000Z",
      },
      { nowMs: NOW },
    );
    expect(vm.originKind).toBe("environment_alert");
    expect(vm.originLabel).toBe("High VPD");
    expect(vm.sourceLabel).toBe("Environment Alert");
    expect(vm.capturedAtLabel).toBe("Captured: 2026-06-14T08:30:00.000Z");
    expect(vm.reviewOnlyLabel).toBe(ACTION_EVIDENCE_REVIEW_ONLY_LABEL);
    expect(vm.safetyNotes).toContain(ACTION_EVIDENCE_NO_AUTOMATION_NOTE);
    expect(vm.safetyNotes).toContain(ACTION_EVIDENCE_HISTORICAL_NOTE);
    expect(vm.hasSnapshotQuality).toBe(false);
    expect(vm.snapshotQuality).toBeNull();
    expect(vm.evidenceQualityLabel).toBe(ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL);
  });

  it("formats AI Doctor-derived action provenance", () => {
    const vm = buildActionEvidenceViewModel({
      source: "ai_doctor",
      action_type: "review_canopy_stress",
      captured_at: "2026-06-14T22:00:00.000Z",
    });
    expect(vm.originKind).toBe("ai_doctor");
    expect(vm.originLabel).toBe("AI Doctor review");
    expect(vm.sourceLabel).toBe("AI Doctor");
    expect(vm.evidenceQualityLabel).toBe(ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL);
  });

  it("falls back safely on unknown origin", () => {
    const vm = buildActionEvidenceViewModel({ source: "weird_source" });
    expect(vm.originKind).toBe("unknown");
    expect(vm.originLabel).toBe(ACTION_EVIDENCE_ORIGIN_FALLBACK);
    expect(vm.sourceLabel).toBe("Unknown");
  });

  it("falls back to 'Environment alert' on unknown alert type", () => {
    const vm = buildActionEvidenceViewModel({
      source: "environment_alert",
      alert_type: "not_a_known_alert_slug",
    });
    expect(vm.originLabel).toBe("Environment alert");
  });

  it("returns neutral unavailable evidence quality when snapshot metrics are missing", () => {
    const vm = buildActionEvidenceViewModel({
      source: "environment_alert",
      alert_type: "high_vpd",
    });
    expect(vm.hasSnapshotQuality).toBe(false);
    expect(vm.snapshotQuality).toBeNull();
    expect(vm.evidenceQualityLabel).toBe(ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL);
  });

  it("classifies sanitized historical snapshot metrics in historical mode", () => {
    const snapshot = {
      source: "manual",
      captured_at: "2026-06-14T11:30:00.000Z",
      temperature_c: 24,
      humidity_pct: 55,
      vpd_kpa: 1.1,
    } as const;
    const vm = buildActionEvidenceViewModel(
      { source: "environment_alert", alert_type: "high_vpd", snapshot },
      { nowMs: NOW },
    );
    expect(vm.hasSnapshotQuality).toBe(true);
    expect(vm.snapshotQuality).not.toBeNull();
    // Historical-mode invariants — never claim current-room support.
    expect(vm.snapshotQuality!.canSupportAiDoctorCurrentContext).toBe(false);
    expect(vm.snapshotQuality!.canSupportActionSuggestionPreview).toBe(false);
    expect(vm.snapshotQuality!.reasons).toContain("Not current-room guidance.");
    expect(vm.evidenceQualityLabel.startsWith("Evidence quality: ")).toBe(true);
  });

  it("historical snapshot quality never supports current AI Doctor / action preview, even with fresh-looking metrics", () => {
    const snapshot = {
      source: "live",
      captured_at: new Date(NOW - 60_000).toISOString(),
      temperature_c: 23,
      humidity_pct: 60,
    } as const;
    const q = classifyManualSensorSnapshotQuality(snapshot, {
      mode: "historical",
      nowMs: NOW,
    });
    expect(q.canSupportAiDoctorCurrentContext).toBe(false);
    expect(q.canSupportActionSuggestionPreview).toBe(false);
  });

  it("captured_at falls back to 'not recorded' when missing or unparseable", () => {
    expect(buildActionEvidenceViewModel({ source: "manual" }).capturedAtLabel)
      .toBe("Captured: not recorded");
    expect(
      buildActionEvidenceViewModel({ source: "manual", captured_at: "not-a-date" })
        .capturedAtLabel,
    ).toBe("Captured: not recorded");
  });

  it("never returns raw_payload / service_role / token / Bearer / private-id strings", () => {
    const dirty = {
      source: "environment_alert",
      action_type: "review_high_vpd",
      alert_type: "high_vpd",
      captured_at: "2026-06-14T11:30:00.000Z",
      snapshot: {
        source: "manual",
        captured_at: "2026-06-14T11:30:00.000Z",
        temperature_c: 25,
        humidity_pct: 60,
        vpd_kpa: 1.2,
      },
      raw_payload: { secret: "sk_live_zzzz" },
      service_role_key: "ey.xx.yy",
      authorization: "Bearer eyExample",
      action_id: "00000000-0000-0000-0000-000000000000",
    } as unknown as Parameters<typeof buildActionEvidenceViewModel>[0];
    const vm = buildActionEvidenceViewModel(dirty);
    const blob = JSON.stringify(vm);
    expect(blob).not.toMatch(/raw_payload/i);
    expect(blob).not.toMatch(/service_role/i);
    expect(blob).not.toMatch(/sk_live_/i);
    expect(blob).not.toMatch(/Bearer\s+ey/i);
    expect(blob).not.toMatch(/00000000-0000-0000-0000-000000000000/);
  });


  it("handles null/undefined input without throwing", () => {
    const a = buildActionEvidenceViewModel(null);
    const b = buildActionEvidenceViewModel(undefined);
    expect(a.originKind).toBe("unknown");
    expect(b.originKind).toBe("unknown");
    expect(a.evidenceQualityLabel).toBe(ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL);
  });

  it("is deterministic for identical input", () => {
    const input = {
      source: "ai_doctor",
      action_type: "review",
      captured_at: "2026-06-14T08:30:00.000Z",
    };
    const a = buildActionEvidenceViewModel(input, { nowMs: NOW });
    const b = buildActionEvidenceViewModel(input, { nowMs: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

import { describe, expect, it } from "vitest";
import { buildAlertActionQueueEvidenceViewModel } from "@/lib/alertActionQueueEvidenceViewModel";
import type { AlertLike } from "@/lib/alertToActionQueueRules";

function alert(overrides: Partial<AlertLike> = {}): AlertLike {
  return {
    id: "alert-123",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: null,
    status: "open",
    severity: "warning",
    metric: "humidity_pct",
    reason: "Humidity is high (78% > 65%)",
    title: "High humidity",
    source: "environment_alerts",
    ...overrides,
  };
}

describe("alertActionQueueEvidenceViewModel", () => {
  it("builds eligible reviewer copy for an open environment alert", () => {
    const vm = buildAlertActionQueueEvidenceViewModel(alert());

    expect(vm.eligible).toBe(true);
    expect(vm.statusLabel).toBe("Ready for grower review");
    expect(vm.summary).toMatch(/approval-required/i);
    expect(vm.actionPreview).toMatch(/humidity control/i);
    expect(vm.duplicateKey).toBe("environment_alert:grow-1:[alert:alert-123]");
    expect(vm.draft?.status).toBe("pending_approval");
    expect(vm.draft?.source).toBe("environment_alert");
  });

  it("shows alert evidence, metric, reason, risk, and back-pointer", () => {
    const vm = buildAlertActionQueueEvidenceViewModel(alert());
    const joined = vm.evidenceItems.join(" ");

    expect(joined).toContain("High humidity");
    expect(joined).toContain("Metric: humidity");
    expect(joined).toContain("Humidity is high");
    expect(joined).toContain("Risk: high");
    expect(joined).toContain("[alert:alert-123]");
  });

  it("pins safety copy as approval-required and non-executable", () => {
    const vm = buildAlertActionQueueEvidenceViewModel(alert());
    const joined = vm.safetyItems.join(" ").toLowerCase();

    expect(joined).toMatch(/approval required/);
    expect(joined).toMatch(/no equipment command/);
    expect(joined).toMatch(/no nutrient, irrigation, or irreversible change/);
    expect(joined).toMatch(/approve, reject, or complete/);
  });

  it("returns not eligible for closed alerts", () => {
    const vm = buildAlertActionQueueEvidenceViewModel(alert({ status: "resolved" }));

    expect(vm.eligible).toBe(false);
    expect(vm.statusLabel).toBe("Not eligible");
    expect(vm.summary).toMatch(/Only open alerts/i);
    expect(vm.blockedReason).toBe("alert_not_open");
    expect(vm.actionPreview).toBeNull();
    expect(vm.draft).toBeNull();
  });

  it("returns not eligible for synthetic snapshot alerts", () => {
    const vm = buildAlertActionQueueEvidenceViewModel(
      alert({ id: "snapshot:stale", metric: "snapshot", reason: "snapshot stale" }),
    );

    expect(vm.eligible).toBe(false);
    expect(vm.blockedReason).toBe("synthetic_alert");
    expect(vm.evidenceItems.join(" ")).toMatch(/snapshot/);
  });

  it("returns not eligible for missing alert", () => {
    const vm = buildAlertActionQueueEvidenceViewModel(null);

    expect(vm.eligible).toBe(false);
    expect(vm.blockedReason).toBe("missing_alert");
    expect(vm.summary).toBe("No alert was provided.");
  });

  it("humanizes common metric labels", () => {
    expect(
      buildAlertActionQueueEvidenceViewModel(alert({ metric: "temperature_c" })).evidenceItems.join(
        " ",
      ),
    ).toContain("Metric: temperature");
    expect(
      buildAlertActionQueueEvidenceViewModel(alert({ metric: "vpd_kpa" })).evidenceItems.join(" "),
    ).toContain("Metric: VPD");
    expect(
      buildAlertActionQueueEvidenceViewModel(alert({ metric: "co2_ppm" })).evidenceItems.join(" "),
    ).toContain("Metric: CO₂");
  });

  it("does not emit device-control or nutrient execution language", () => {
    const vm = buildAlertActionQueueEvidenceViewModel(alert());
    const text = [
      vm.summary,
      vm.actionPreview,
      ...vm.evidenceItems,
      ...vm.safetyItems,
      vm.draft?.suggested_change,
      vm.draft?.reason,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    expect(text).not.toMatch(/mqtt|webhook|relay|actuator|home[- ]?assistant/);
    expect(text).not.toMatch(/turn on|turn off|execute|autopilot|device control/);
    expect(text).not.toMatch(/increase nutrients|feed strength|ec to|ph to/);
  });
});

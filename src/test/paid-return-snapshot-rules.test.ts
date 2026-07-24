import { describe, expect, it } from "vitest";

import {
  buildPaidReturnCohortViewModel,
  parsePaidReturnSnapshot,
} from "@/lib/paidReturnSnapshotRules";

describe("paid-return snapshot rules", () => {
  it("keeps only fixed aggregate counts and drops identifiers", () => {
    const parsed = parsePaidReturnSnapshot({
      ok: true,
      generated_at: "2026-07-17T01:00:00Z",
      counts: {
        tracked_paid_activations: 12,
        in_flight_paid_activations: 4,
        matured_paid_activations_60d: 8,
        manual_grow_returned_60d: 5,
        server_completed_ai_doctor_returned_60d: 2,
        paid_returned_60d: 6,
        user_id: "must-not-survive",
        email: "must-not-survive@example.com",
      },
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.counts).toEqual({
      paidReturnMetricsAvailable: true,
      trackedPaidActivations: 12,
      inFlightPaidActivations: 4,
      maturedPaidActivations60d: 8,
      manualGrowReturned60d: 5,
      serverCompletedAiDoctorReturned60d: 2,
      paidReturned60d: 6,
    });
    expect(JSON.stringify(parsed)).not.toContain("must-not-survive");
  });

  it("fails closed for malformed or incomplete aggregate count sets", () => {
    expect(parsePaidReturnSnapshot(null).ok).toBe(false);

    const parsed = parsePaidReturnSnapshot({
      ok: true,
      counts: {
        tracked_paid_activations: -1,
        in_flight_paid_activations: "4",
        matured_paid_activations_60d: 2.9,
        manual_grow_returned_60d: 1,
      },
    });

    expect(parsed.counts.paidReturnMetricsAvailable).toBe(false);
    expect(parsed.counts.trackedPaidActivations).toBe(0);
    expect(parsed.counts.inFlightPaidActivations).toBe(0);
    expect(parsed.counts.maturedPaidActivations60d).toBe(2);
  });

  it("reports a rate only for a reconciled cohort that has reached day 60", () => {
    const mature = parsePaidReturnSnapshot({
      ok: true,
      counts: {
        tracked_paid_activations: 12,
        in_flight_paid_activations: 4,
        matured_paid_activations_60d: 8,
        manual_grow_returned_60d: 5,
        server_completed_ai_doctor_returned_60d: 1,
        paid_returned_60d: 5,
      },
    });
    const vm = buildPaidReturnCohortViewModel(mature.counts);
    expect(vm.status).toBe("return_observed");
    expect(vm.returnRatePercent).toBe(62.5);
    expect(vm.guidance).toContain("product-behavior signal");

    const maturing = parsePaidReturnSnapshot({
      ok: true,
      counts: {
        tracked_paid_activations: 4,
        in_flight_paid_activations: 4,
        matured_paid_activations_60d: 0,
        manual_grow_returned_60d: 0,
        server_completed_ai_doctor_returned_60d: 0,
        paid_returned_60d: 0,
      },
    });
    const maturingVm = buildPaidReturnCohortViewModel(maturing.counts);
    expect(maturingVm.status).toBe("maturing");
    expect(maturingVm.returnRatePercent).toBeNull();
  });

  it("fails closed when aggregate counts do not reconcile", () => {
    const parsed = parsePaidReturnSnapshot({
      ok: true,
      counts: {
        tracked_paid_activations: 4,
        in_flight_paid_activations: 1,
        matured_paid_activations_60d: 3,
        manual_grow_returned_60d: 3,
        server_completed_ai_doctor_returned_60d: 1,
        paid_returned_60d: 2,
      },
    });

    const vm = buildPaidReturnCohortViewModel(parsed.counts);
    expect(vm.status).toBe("integrity_mismatch");
    expect(vm.returnRatePercent).toBeNull();
  });

  it("accepts the deduplicated union of manual and server-validated review returns", () => {
    const parsed = parsePaidReturnSnapshot({
      ok: true,
      counts: {
        tracked_paid_activations: 10,
        in_flight_paid_activations: 2,
        matured_paid_activations_60d: 8,
        manual_grow_returned_60d: 4,
        server_completed_ai_doctor_returned_60d: 4,
        paid_returned_60d: 6,
      },
    });

    const vm = buildPaidReturnCohortViewModel(parsed.counts);
    expect(vm.status).toBe("return_observed");
    expect(vm.paidReturned60d).toBe(6);
    expect(vm.serverCompletedAiDoctorReturned60d).toBe(4);
  });
});

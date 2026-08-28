import { describe, expect, it } from "vitest";
import {
  buildConversionOpportunities,
  parseFunnelOpportunitySnapshot,
} from "@/lib/conversionOpportunityRules";

describe("conversion opportunity rules", () => {
  it("parses allowlisted aggregate events and ranks deterministic 30-day gaps", () => {
    const snapshot = parseFunnelOpportunitySnapshot({
      ok: true,
      generated_at: "2026-08-26T12:00:00Z",
      counts_by_event: [
        { event_name: "signup", total: 100, last_24h: 2, last_7d: 20, last_30d: 80 },
        { event_name: "quick_log_saved", total: 60, last_30d: 30 },
        { event_name: "paywall_viewed", total: 40, last_30d: 20 },
        { event_name: "paywall_cta_clicked", total: 10, last_30d: 5 },
        { event_name: "checkout_started", total: 8, last_30d: 8 },
        { event_name: "subscription_activated", total: 3, last_30d: 3 },
        { event_name: "email_address", total: 999, last_30d: 999 },
      ],
    });

    expect(snapshot.ok).toBe(true);
    expect(snapshot.counts).toHaveLength(6);
    expect(buildConversionOpportunities(snapshot.counts)).toEqual([
      expect.objectContaining({ id: "activation", gap: 50, directionalRatePercent: 37.5, rank: 1 }),
      expect.objectContaining({
        id: "upgrade_intent",
        gap: 15,
        directionalRatePercent: 25,
        rank: 2,
      }),
      expect.objectContaining({
        id: "checkout_completion",
        gap: 5,
        directionalRatePercent: 37.5,
        rank: 3,
      }),
    ]);
  });

  it("fails closed for invalid input and invalid counts", () => {
    expect(parseFunnelOpportunitySnapshot(null)).toMatchObject({
      ok: false,
      reason: "unknown_response",
      counts: [],
    });
    const snapshot = parseFunnelOpportunitySnapshot({
      ok: true,
      counts_by_event: [{ event_name: "signup", last_30d: -1 }],
    });
    expect(buildConversionOpportunities(snapshot.counts)[0]).toMatchObject({
      status: "no_data",
      directionalRatePercent: null,
      rank: null,
    });
  });

  it("does not report a misleading rate when downstream events exceed upstream events", () => {
    const snapshot = parseFunnelOpportunitySnapshot({
      ok: true,
      counts_by_event: [
        { event_name: "checkout_started", last_30d: 2 },
        { event_name: "subscription_activated", last_30d: 4 },
      ],
    });
    expect(buildConversionOpportunities(snapshot.counts)[2]).toMatchObject({
      status: "integrity_warning",
      directionalRatePercent: null,
      gap: 0,
      rank: null,
    });
  });

  it("returns identical results for repeated calls", () => {
    const snapshot = parseFunnelOpportunitySnapshot({ ok: true, counts_by_event: [] });
    expect(buildConversionOpportunities(snapshot.counts)).toEqual(
      buildConversionOpportunities(snapshot.counts),
    );
  });
});

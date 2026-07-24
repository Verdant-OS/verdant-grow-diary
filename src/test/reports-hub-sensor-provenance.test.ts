import { describe, expect, it } from "vitest";

import { isReportsHubSensorContextRow } from "@/hooks/useReportsHubData";

describe("Reports Hub sensor provenance fence", () => {
  it("rejects diagnostic and canonical non-evidence rows from unlabeled counts", () => {
    expect(
      isReportsHubSensorContextRow({
        ts: "2026-07-17T10:00:00Z",
        source: "live",
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: { confidence: "test" },
        },
      }),
    ).toBe(false);
    expect(
      isReportsHubSensorContextRow({
        ts: "2026-07-17T10:00:00Z",
        source: "ecowitt_windows_testbench",
      }),
    ).toBe(false);
    for (const source of ["demo", "stale", "invalid", null]) {
      expect(
        isReportsHubSensorContextRow({
          ts: "2026-07-17T10:00:00Z",
          source,
        }),
      ).toBe(false);
    }
  });

  it("retains physical gateway, manual, and CSV context rows", () => {
    expect(
      isReportsHubSensorContextRow({
        ts: "2026-07-17T10:00:00Z",
        source: "live",
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: {
            reported_verdant_source: "live",
            raw_payload: {
              PASSKEY: "redacted",
              stationtype: "GW2000A",
              dateutc: "2026-07-17 10:00:00",
            },
          },
        },
      }),
    ).toBe(true);
    expect(isReportsHubSensorContextRow({ ts: "2026-07-17T10:00:00Z", source: "manual" })).toBe(
      true,
    );
    expect(isReportsHubSensorContextRow({ ts: "2026-07-17T10:00:00Z", source: "csv" })).toBe(true);
  });
});

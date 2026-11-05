/**
 * Regressions for Codex review findings on PR #2902 at 1f9fbd8e:
 * year-first slash timestamps (Vivosun), soil temperature units, and the
 * time-zone list when the runtime can't enumerate zones. Synthetic fixtures.
 */
import { describe, expect, it } from "vitest";
import { parseEnvironmentCSVText } from "@/lib/csvParser";

const CHICAGO = "America/Chicago";

describe("Codex review fixes (1f9fbd8e)", () => {
  it("reads year-first slash timestamps (Vivosun) as wall clock needing a zone", async () => {
    const { interpretCsvTimestamp } = await import("@/lib/csvTimestampRules");
    expect(interpretCsvTimestamp("2026/05/18 00:00:00", null)).toEqual({ kind: "needs_zone" });
    expect(interpretCsvTimestamp("2026/05/18 00:00:00", CHICAGO)).toMatchObject({
      kind: "resolved",
      iso: "2026-05-18T05:00:00.000Z",
    });
    expect(interpretCsvTimestamp("2026/02/30 00:00:00", CHICAGO)).toEqual({ kind: "invalid" });
    const csv =
      "Timestamp(1 min),Built-in Temperature(℉),Built-in Humidity(%)\n2026/05/18 00:00:00,87.1,58\n";
    expect(parseEnvironmentCSVText(csv).unresolvedTimeRows?.[0]?.reason).toBe(
      "needs_source_time_zone",
    );
    expect(parseEnvironmentCSVText(csv, { sourceTimeZone: CHICAGO }).validRows).toHaveLength(1);
  });

  it("never saves a soil temperature in an unstated or misread unit", () => {
    const f = parseEnvironmentCSVText("Timestamp,Soil Temperature F\n2026-11-05T11:00:00Z,77\n");
    expect(f.validRows[0].soil_temp_c).toBe(25);
    const c = parseEnvironmentCSVText("Timestamp,Soil Temp ℃\n2026-11-05T11:00:00Z,25\n");
    expect(c.validRows[0].soil_temp_c).toBe(25);
    const unitless = parseEnvironmentCSVText("Timestamp,soil_temp\n2026-11-05T11:00:00Z,77\n");
    expect(unitless.validRows).toEqual([]);
    expect(unitless.unsupportedColumns).toEqual(["soil_temp"]);
  });

  it("offers real zones when the runtime cannot enumerate them", async () => {
    const { listSourceTimeZones } = await import("@/lib/csvTimestampRules");
    const zones = listSourceTimeZones("UTC", null);
    expect(zones).toContain(CHICAGO);
    expect(zones).toContain("Europe/London");
    expect(zones[0]).toBe("UTC");
    expect(listSourceTimeZones("America/Denver", ["Asia/Tokyo"])).toEqual([
      "America/Denver",
      "Asia/Tokyo",
      "UTC",
    ]);
  });
});

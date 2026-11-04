/**
 * #2744 review 5761014874 P2-1: reloaded CSV history must keep "Derived VPD".
 * Uses the real select constant and payload rebuild, not a mock that returns
 * the whole raw_payload.
 */
import { describe, expect, it } from "vitest";
import { IMPORTED_SENSOR_HISTORY_SELECT } from "@/hooks/useImportedSensorHistory";
import { CsvImportVendorIdentity } from "@/lib/csvImportVendorIdentity";
import { TimelineBoundedRead } from "@/lib/timelineBoundedRead";

describe("imported history keeps the VPD source after reload", () => {
  it("selects vpd_source from raw_payload", () => {
    const columns = IMPORTED_SENSOR_HISTORY_SELECT.split(",");
    expect(columns).toContain("vpd_source:raw_payload->>vpd_source");
  });

  it("carries a derived VPD source through the rebuilt payload", () => {
    const row = { id: "r1", metric: "vpd_kpa", csv_import: "true", vpd_source: "derived" };
    const payload = TimelineBoundedRead.importedHistoryPayload(row);
    expect(CsvImportVendorIdentity.vpdSource({ raw_payload: payload })).toBe("derived");
  });

  it("ignores an unknown vpd_source value", () => {
    const payload = TimelineBoundedRead.importedHistoryPayload({ vpd_source: "guessed" });
    expect(CsvImportVendorIdentity.vpdSource({ raw_payload: payload })).toBeNull();
  });
});

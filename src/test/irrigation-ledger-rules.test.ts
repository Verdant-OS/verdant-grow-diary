import { describe, it, expect } from "vitest";
import {
  buildIrrigationLedger,
  buildKeysetPage,
  normalizeIrrigationSource,
  irrigationSourceLabel,
} from "@/lib/irrigation/irrigationLedgerRules";

const watering = (over: Record<string, unknown> = {}) => ({
  id: "w-1",
  event_type: "watering",
  occurred_at: "2026-07-20T10:00:00.000000Z",
  source: "manual",
  is_deleted: false,
  note: null,
  plant_id: null,
  tent_id: "tent-1",
  watering_events: { volume_ml: 1000, ph: 6.1, ec_ms_cm: 1.8, runoff_ec: 2.2, water_temp_c: 20 },
  ...over,
});

describe("irrigation ledger rules", () => {
  it("renders EVERY non-deleted watering/feeding event, incl. a note-only one (R7)", () => {
    const rows = buildIrrigationLedger([
      watering(),
      watering({ id: "w-2", watering_events: null, note: "watered, forgot to measure" }),
      { id: "f-1", event_type: "feeding", occurred_at: "2026-07-20T09:00:00Z", source: "manual", is_deleted: false, feeding_events: { ec_in: 2.0, ec_out: 2.4, products: [{ name: "CalMag", amount: 5, unit: "ml" }] } },
    ]);
    expect(rows).toHaveLength(3);
    const noteOnly = rows.find((r) => r.id === "w-2")!;
    expect(noteOnly.unmeasured).toBe(true);
    expect(noteOnly.note).toBe("watered, forgot to measure");
    expect(noteOnly.volumeMl).toBeNull(); // unknown, not zero
  });

  it("drops deleted rows and non-irrigation events only", () => {
    const rows = buildIrrigationLedger([
      watering({ id: "w-del", is_deleted: true }),
      { id: "o-1", event_type: "observation", occurred_at: "2026-07-20T08:00:00Z", is_deleted: false },
      watering({ id: "w-keep" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["w-keep"]);
  });

  it("keeps EC canonical mS/cm and feeding input EC prefers ec_in", () => {
    const [feed] = buildIrrigationLedger([
      { id: "f-1", event_type: "feeding", occurred_at: "2026-07-20T09:00:00Z", source: "manual", is_deleted: false, feeding_events: { ec_in: 2.0, ec_ms_cm: 9.9, ec_out: 2.4 } },
    ]);
    expect(feed.ecMsCm).toBe(2.0); // prefers ec_in over ec_ms_cm
    expect(feed.outputEcMsCm).toBe(2.4);
  });

  it("preserves voice/ai/import provenance and never mislabels known source (R9)", () => {
    expect(irrigationSourceLabel(normalizeIrrigationSource("voice"))).toBe("Voice log");
    expect(irrigationSourceLabel(normalizeIrrigationSource("ai"))).toBe("AI-generated");
    expect(irrigationSourceLabel(normalizeIrrigationSource("import"))).toBe("Imported log");
    expect(irrigationSourceLabel(normalizeIrrigationSource("manual"))).toBe("Manual log");
    // genuinely absent → the ONLY unavailable label
    expect(irrigationSourceLabel(normalizeIrrigationSource(null))).toBe("Source unavailable");
    for (const s of ["manual", "voice", "ai", "import", "unknown"] as const) {
      expect(irrigationSourceLabel(s).toLowerCase()).not.toMatch(/\blive\b|healthy/);
    }
  });

  it("orders newest first with a deterministic id DESC tie-break at equal timestamps", () => {
    const ts = "2026-07-20T10:00:00.000000Z";
    const rows = buildIrrigationLedger([
      watering({ id: "aaa", occurred_at: ts }),
      watering({ id: "ccc", occurred_at: ts }),
      watering({ id: "bbb", occurred_at: ts }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["ccc", "bbb", "aaa"]);
  });

  it("keyset page uses RAW occurred_at verbatim (microsecond precision) and pageSize+1 hasMore (R5/R6)", () => {
    const raw = [
      { id: "r1", occurred_at: "2026-07-20T10:00:00.789012Z" },
      { id: "r2", occurred_at: "2026-07-20T10:00:00.789012Z" },
      { id: "r3", occurred_at: "2026-07-20T09:00:00.000000Z" }, // the +1 sentinel
    ];
    const { pageRawRows, hasMore, nextCursor } = buildKeysetPage(raw, 2);
    expect(hasMore).toBe(true);
    expect(pageRawRows).toHaveLength(2);
    // cursor is the LAST row of the page, verbatim microsecond string — never truncated
    expect(nextCursor).toEqual({ occurredAt: "2026-07-20T10:00:00.789012Z", id: "r2" });
  });

  it("keyset page reports no more when the raw set fits the page", () => {
    const { hasMore, nextCursor } = buildKeysetPage([{ id: "r1", occurred_at: "2026-07-20T10:00:00Z" }], 2);
    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
  });
});

/**
 * Slice A3.2 — QuickLog harvest form wiring into Vocab A → Vocab B
 * conversion + timeline "original unit" display.
 *
 * Contract:
 *  - Grams entry (unit="g") persists unchanged Vocab A shape (legacy
 *    backward-compat guarantee — no schema drift).
 *  - Non-grams entry (oz/lb/kg) additionally stamps canonical grams and
 *    the grower's ORIGINAL value+unit into p_details.harvest, so
 *    downstream consumers see honest grams and the timeline can render
 *    "2 lb (907.18 g)" instead of implying grams.
 *  - Empty weights never become 0g.
 *  - HarvestTimelineCard renders "value unit (grams g)" only when
 *    both original_weight_unit (non-g) AND canonical grams exist —
 *    legacy rows are rendered unchanged and never invent originals.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";
import HarvestTimelineCard from "@/components/HarvestTimelineCard";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

function mountForm() {
  return render(
    <QuickLogAllActivitiesSection growId="g1" tentId="t1" plantId="p1" />,
  );
}
function selectHarvest() {
  fireEvent.click(
    screen.getByTestId("quick-log-all-activities-picker-harvest"),
  );
}

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({
    data: { ok: true, grow_event_id: "ge-x" },
    error: null,
  });
});

async function saveHarvest(wet: string, dry: string, unit: string) {
  mountForm();
  selectHarvest();
  await screen.findByTestId("quick-log-all-activities-harvest-fields");
  fireEvent.change(
    screen.getByTestId("quick-log-all-activities-harvest-wet"),
    { target: { value: wet } },
  );
  fireEvent.change(
    screen.getByTestId("quick-log-all-activities-harvest-dry"),
    { target: { value: dry } },
  );
  fireEvent.change(
    screen.getByTestId("quick-log-all-activities-harvest-unit"),
    { target: { value: unit } },
  );
  fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
  await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
  return rpcMock.mock.calls[0][1] as Record<string, unknown>;
}

describe("QuickLog harvest → Vocab A→B persistence wiring", () => {
  it("2 lb entry sends canonical grams AND original value+unit", async () => {
    const args = await saveHarvest("2", "", "lb");
    expect(args.p_event_type).toBe("harvest");
    const details = (args.p_details as { harvest: Record<string, unknown> })
      .harvest;
    expect(details.wetWeight).toBe("2");
    expect(details.weightUnit).toBe("lb");
    expect(details.original_wet_weight).toBe("2");
    expect(details.original_weight_unit).toBe("lb");
    expect(details.wet_weight_grams).toBeCloseTo(453.59237 * 2, 6);
    // No dry weight → no dry grams / dry original invented.
    expect(details.dry_weight_grams).toBeUndefined();
    expect(details.original_dry_weight).toBeUndefined();
  });

  it("8 oz entry sends canonical grams AND original unit", async () => {
    const args = await saveHarvest("8", "", "oz");
    const details = (args.p_details as { harvest: Record<string, unknown> })
      .harvest;
    expect(details.wet_weight_grams).toBeCloseTo(28.349523125 * 8, 6);
    expect(details.original_wet_weight).toBe("8");
    expect(details.original_weight_unit).toBe("oz");
  });

  it("g entry stays byte-for-byte Vocab A (no grams enrichment)", async () => {
    const args = await saveHarvest("120", "22", "g");
    expect(args.p_details).toEqual({
      harvest: { wetWeight: "120", dryWeight: "22", weightUnit: "g" },
    });
  });

  it("empty wet/dry with lb unit omits harvest entirely (no fake 0 g)", async () => {
    const args = await saveHarvest("", "", "lb");
    expect(args.p_details).toBeNull();
  });

  it("dry-only kg entry stamps dry grams, not wet", async () => {
    const args = await saveHarvest("", "0.5", "kg");
    const details = (args.p_details as { harvest: Record<string, unknown> })
      .harvest;
    expect(details.dry_weight_grams).toBeCloseTo(500, 6);
    expect(details.original_dry_weight).toBe("0.5");
    expect(details.original_weight_unit).toBe("kg");
    expect(details.wet_weight_grams).toBeUndefined();
    expect(details.original_wet_weight).toBeUndefined();
  });
});

describe("HarvestTimelineCard — original unit + grams display", () => {
  it('renders "2 lb (907.18 g)" when original + grams present', () => {
    render(
      <ul>
        <HarvestTimelineCard
          entryId="e1"
          timestampLabel="t"
          harvest={{
            wetWeight: "2",
            weightUnit: "lb",
            wet_weight_grams: 453.59237 * 2,
            original_wet_weight: "2",
            original_weight_unit: "lb",
          }}
        />
      </ul>,
    );
    expect(
      screen.getByTestId("harvest-timeline-card-wet-weight"),
    ).toHaveTextContent("2 lb (907.18 g)");
  });

  it('renders legacy grams-only row unchanged as "120 g"', () => {
    render(
      <ul>
        <HarvestTimelineCard
          entryId="e1"
          timestampLabel="t"
          harvest={{ wetWeight: "120", weightUnit: "g" }}
        />
      </ul>,
    );
    expect(
      screen.getByTestId("harvest-timeline-card-wet-weight"),
    ).toHaveTextContent(/^120 g$/);
  });

  it("does not invent originals for legacy rows with no original fields", () => {
    render(
      <ul>
        <HarvestTimelineCard
          entryId="e1"
          timestampLabel="t"
          harvest={{ wetWeight: "8", weightUnit: "oz" }}
        />
      </ul>,
    );
    // No wet_weight_grams / original_weight_unit persisted → render
    // must NOT append a "(... g)" clause.
    expect(
      screen.getByTestId("harvest-timeline-card-wet-weight"),
    ).toHaveTextContent(/^8 oz$/);
  });
});

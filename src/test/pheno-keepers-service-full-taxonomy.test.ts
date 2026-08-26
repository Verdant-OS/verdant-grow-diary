/**
 * phenoKeepersService.listCrossesForHunt — new taxonomy fields are read
 * and mapped null-safely.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, selectMock, eqMock, orderMock, limitMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const orderMock = vi.fn(() => ({ limit: limitMock }));
  const eqMock = vi.fn(() => ({ order: orderMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return { fromMock, selectMock, eqMock, orderMock, limitMock };
});

vi.mock("@/integrations/supabase/phenoTables", () => ({
  phenoDb: { from: fromMock },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: () => Promise.resolve({ data: { user: null } }) } },
}));

import { listCrossesForHunt } from "@/lib/phenoKeepersService";

beforeEach(() => {
  limitMock.mockReset();
  orderMock.mockClear();
  eqMock.mockClear();
  selectMock.mockClear();
  fromMock.mockClear();
});

describe("listCrossesForHunt — full taxonomy read-model", () => {
  it("selects channel / generation / recurrent_parent_id and maps them null-safely", async () => {
    limitMock.mockResolvedValue({
      data: [
        {
          id: "x1",
          female_keeper_id: "kf",
          male_keeper_id: "km",
          cross_type: "backcross",
          cross_name: "BX1",
          note: null,
          crossed_at: "2026-07-07T00:00:00Z",
          created_at: "2026-07-07T00:00:00Z",
          channel: "natural_male",
          generation: 2,
          recurrent_parent_id: "krp",
        },
        {
          id: "x2",
          female_keeper_id: "kf",
          male_keeper_id: null,
          cross_type: "selfing_s1",
          cross_name: null,
          note: null,
          crossed_at: null,
          created_at: null,
          // Legacy row shape — new columns absent entirely.
        },
      ],
      error: null,
    });

    const rows = await listCrossesForHunt("hunt-1");
    // Query includes the new columns.
    const call = selectMock.mock.calls[0] as unknown as [string];
    const selectArg = call[0];
    expect(selectArg).toContain("channel");
    expect(selectArg).toContain("generation");
    expect(selectArg).toContain("recurrent_parent_id");

    expect(rows).toHaveLength(2);
    expect(rows[0].channel).toBe("natural_male");
    expect(rows[0].generation).toBe(2);
    expect(rows[0].recurrentParentId).toBe("krp");
    // Legacy row: all three new fields null.
    expect(rows[1].channel).toBeNull();
    expect(rows[1].generation).toBeNull();
    expect(rows[1].recurrentParentId).toBeNull();
  });

  it("fails closed on a read error instead of rendering 'no crosses'", async () => {
    limitMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(listCrossesForHunt("hunt-1")).rejects.toThrow(/could not load crosses/i);
  });

  it("falls back to the legacy 3-type columns when the taxonomy columns are unapplied", async () => {
    // The hosted project may not have channel/generation/recurrent_parent_id
    // yet (unapplied 20260728090000): a 42703 naming those columns retries
    // with the legacy column list instead of failing or silently emptying.
    limitMock
      .mockResolvedValueOnce({
        data: null,
        error: { code: "42703", message: "column pheno_crosses.channel does not exist" },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "x1",
            female_keeper_id: "k1",
            male_keeper_id: null,
            cross_type: "selfing_s1",
            cross_name: "Gas S1",
            note: null,
            crossed_at: null,
            created_at: "2026-08-01T00:00:00Z",
          },
        ],
        error: null,
      });
    const rows = await listCrossesForHunt("hunt-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].crossType).toBe("selfing_s1");
    expect(rows[0].channel).toBeNull();
    expect(rows[0].generation).toBeNull();
  });

  it("empty hunt id short-circuits (no query)", async () => {
    const rows = await listCrossesForHunt("   ");
    expect(rows).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

/**
 * phenoKeepersService stability-run read/write.
 *
 * listKeepersForHunt maps + re-sanitizes the stability_runs column null-safely
 * (legacy rows with the column absent degrade to []); updateKeeperStabilityRuns
 * sanitizes before writing, RLS-scopes to owner + keeper id, and treats a
 * silently-blocked write (null data) as an error, never a false success.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, listChain, ownerChain, updateChain } = vi.hoisted(() => {
  // listKeepersForHunt: from().select().eq().order() → resolves
  const orderMock = vi.fn();
  const listEqMock = vi.fn(() => ({ order: orderMock }));
  // listKeeperStabilityForOwner: from().select().order().limit() → resolves
  // (no .eq — RLS scopes to the owner)
  const ownerLimitMock = vi.fn();
  const ownerOrderMock = vi.fn(() => ({ limit: ownerLimitMock }));
  // select() must serve BOTH shapes; return an object exposing eq AND order.
  const listSelectMock = vi.fn(() => ({ eq: listEqMock, order: ownerOrderMock }));
  // update: from().update().eq().eq().select().maybeSingle() → resolves
  const maybeSingleMock = vi.fn();
  const updSelectMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
  const updEq2Mock = vi.fn(() => ({ select: updSelectMock }));
  const updEq1Mock = vi.fn(() => ({ eq: updEq2Mock }));
  const updateMock = vi.fn(() => ({ eq: updEq1Mock }));
  const fromMock = vi.fn(() => ({ select: listSelectMock, update: updateMock }));
  return {
    fromMock,
    listChain: { listSelectMock, listEqMock, orderMock },
    ownerChain: { ownerOrderMock, ownerLimitMock },
    updateChain: { updateMock, updEq1Mock, updEq2Mock, updSelectMock, maybeSingleMock },
  };
});

let currentUser: { id: string } | null = { id: "owner-1" };

vi.mock("@/integrations/supabase/phenoTables", () => ({
  phenoDb: { from: fromMock },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) } },
}));

import {
  listKeepersForHunt,
  listKeeperStabilityForOwner,
  updateKeeperStabilityRuns,
} from "@/lib/phenoKeepersService";

beforeEach(() => {
  currentUser = { id: "owner-1" };
  for (const fn of [
    ...Object.values(listChain),
    ...Object.values(ownerChain),
    ...Object.values(updateChain),
    fromMock,
  ]) {
    (fn as ReturnType<typeof vi.fn>).mockClear();
  }
});

describe("listKeepersForHunt — stability_runs read", () => {
  it("selects and re-sanitizes stability_runs; legacy rows without it degrade to []", async () => {
    listChain.orderMock.mockResolvedValue({
      data: [
        {
          id: "k1",
          hunt_id: "h1",
          source_plant_id: "p1",
          keeper_name: "Gas",
          note: null,
          created_at: null,
          stability_runs: [
            // one valid run, plus junk that must be dropped
            { runLabel: "Run 1", observedAt: "2026-02-01", traits: { nose_loudness: 8, bogus: 3 }, note: "gassy" },
            { runLabel: "   ", traits: { vigor: 4 } },
          ],
        },
        {
          id: "k2",
          hunt_id: "h1",
          source_plant_id: "p2",
          keeper_name: "Cake",
          note: null,
          created_at: null,
          // legacy: column absent
        },
      ],
      error: null,
    });

    const rows = await listKeepersForHunt("h1");
    expect((listChain.listSelectMock.mock.calls[0] as unknown[])[0]).toContain("stability_runs");
    expect(rows[0].stabilityRuns).toEqual([
      { runLabel: "Run 1", observedAt: "2026-02-01", traits: { nose_loudness: 8 }, note: "gassy" },
    ]);
    expect(rows[1].stabilityRuns).toEqual([]);
  });
});

describe("listKeeperStabilityForOwner — owner-wide read", () => {
  it("reads all owner keepers (no hunt filter — RLS scopes to owner) and sanitizes runs", async () => {
    ownerChain.ownerLimitMock.mockResolvedValue({
      data: [
        {
          id: "k1",
          hunt_id: "h1",
          keeper_name: "Gas",
          stability_runs: [
            { runLabel: "R1", observedAt: "2026-02-01", traits: { nose_loudness: 8, junk: 3 }, note: "x" },
          ],
        },
        { id: "k2", hunt_id: "h2", keeper_name: "Cake" }, // legacy: column absent
      ],
      error: null,
    });
    const rows = await listKeeperStabilityForOwner();
    // Selected the minimal projection, ordered, bounded — and NEVER filtered by
    // a client-supplied user id (RLS does the owner scoping).
    expect((listChain.listSelectMock.mock.calls[0] as unknown[])[0]).toContain("stability_runs");
    expect(listChain.listEqMock).not.toHaveBeenCalled();
    expect(ownerChain.ownerLimitMock).toHaveBeenCalled();
    expect(rows).toEqual([
      {
        keeperId: "k1",
        huntId: "h1",
        keeperName: "Gas",
        stabilityRuns: [
          { runLabel: "R1", observedAt: "2026-02-01", traits: { nose_loudness: 8 }, note: "x" },
        ],
      },
      { keeperId: "k2", huntId: "h2", keeperName: "Cake", stabilityRuns: [] },
    ]);
  });

  it("returns [] on error without throwing (best-effort read)", async () => {
    ownerChain.ownerLimitMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await listKeeperStabilityForOwner()).toEqual([]);
  });
});

describe("updateKeeperStabilityRuns — write", () => {
  it("sanitizes, scopes to owner + keeper id, and returns ok on a read-back row", async () => {
    updateChain.maybeSingleMock.mockResolvedValue({ data: { id: "k1" }, error: null });
    const res = await updateKeeperStabilityRuns({
      keeperId: "k1",
      runs: [
        { runLabel: "Run 1", traits: { nose_loudness: 8, made_up: 2 }, note: "x" },
        { runLabel: "  ", traits: { vigor: 4 } }, // no label → dropped
      ],
    });
    expect(res).toEqual({ ok: true, id: "k1" });
    // Sanitized payload written (unknown axis + label-less run removed).
    expect((updateChain.updateMock.mock.calls[0] as unknown[])[0]).toEqual({
      stability_runs: [{ runLabel: "Run 1", observedAt: null, traits: { nose_loudness: 8 }, note: "x" }],
    });
    // RLS scoping: keeper id AND owner id.
    expect(updateChain.updEq1Mock).toHaveBeenCalledWith("id", "k1");
    expect(updateChain.updEq2Mock).toHaveBeenCalledWith("user_id", "owner-1");
  });

  it("treats a silently-blocked write (null data) as an error, not a false success", async () => {
    updateChain.maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await updateKeeperStabilityRuns({ keeperId: "k1", runs: [] });
    expect(res.ok).toBe(false);
  });

  it("requires a signed-in user", async () => {
    currentUser = null;
    const res = await updateKeeperStabilityRuns({ keeperId: "k1", runs: [] });
    expect(res.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a missing keeper id without a query", async () => {
    const res = await updateKeeperStabilityRuns({ keeperId: "  ", runs: [] });
    expect(res.ok).toBe(false);
    expect(updateChain.updateMock).not.toHaveBeenCalled();
  });
});

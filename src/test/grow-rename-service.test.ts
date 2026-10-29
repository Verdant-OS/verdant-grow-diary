/**
 * renameGrow — owner-scoped grows update, confirmed by read-back.
 *
 * An invalid name never reaches the client; a read-back without the new name
 * is "unconfirmed", a thrown error is "failed", and both keep the message the
 * card shows. Success returns the trimmed name actually stored.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ updateGrowRow: vi.fn() }));
vi.mock("@/lib/db", () => ({ updateGrowRow: (...args: unknown[]) => db.updateGrowRow(...args) }));

import { renameGrow } from "@/lib/growRenameService";
import { SIMPLE_HOME_SETUP_COPY } from "@/lib/simpleHomeSetupRules";

const GROW = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  db.updateGrowRow.mockReset();
});

describe("renameGrow", () => {
  it("trims, writes only the name, and confirms the read-back", async () => {
    db.updateGrowRow.mockResolvedValue({ id: GROW, name: "Veg room" });
    await expect(renameGrow(GROW, "  Veg room  ")).resolves.toEqual({ ok: true, name: "Veg room" });
    expect(db.updateGrowRow).toHaveBeenCalledWith(GROW, { name: "Veg room" });
  });

  it("rejects an invalid name without touching the client", async () => {
    await expect(renameGrow(GROW, "   ")).resolves.toEqual({
      ok: false,
      message: SIMPLE_HOME_SETUP_COPY.renameInvalid,
    });
    await expect(renameGrow(GROW, "x".repeat(81))).resolves.toMatchObject({ ok: false });
    await expect(renameGrow("", "Fine")).resolves.toMatchObject({ ok: false });
    expect(db.updateGrowRow).not.toHaveBeenCalled();
  });

  it("a read-back without the new name is unconfirmed, not saved", async () => {
    db.updateGrowRow.mockResolvedValue({ id: GROW, name: "Old name" });
    await expect(renameGrow(GROW, "New name")).resolves.toEqual({
      ok: false,
      message: SIMPLE_HOME_SETUP_COPY.renameUnconfirmed,
    });
  });

  it("a thrown write is reported as failed", async () => {
    db.updateGrowRow.mockRejectedValue(new Error("db.updateGrowRow: RLS"));
    await expect(renameGrow(GROW, "New name")).resolves.toEqual({
      ok: false,
      message: SIMPLE_HOME_SETUP_COPY.renameFailed,
    });
  });
});

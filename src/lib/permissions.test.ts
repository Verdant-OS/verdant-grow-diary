import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  DiaryEntryInsert,
  DiaryEntryUpdate,
  GrowInsert,
  GrowRow,
  GrowUpdate,
  HarvestInsert,
  UserRoleInsert,
} from "@/lib/db";

/* ------------------------------------------------------------------ */
//  Mocks
/* ------------------------------------------------------------------ */
const authState: { user: { id: string } | null; error: { message: string } | null } = {
  user: { id: "u-self" },
  error: null,
};

const updateMock = vi.fn(() => ({
  eq: vi.fn(() => Promise.resolve({ error: null })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: authState.user }, error: authState.error }),
    },
    from: () => ({ update: updateMock }),
  },
}));

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    ...actual,
    fetchUserRoles: vi.fn(async () => [] as string[]),
    fetchGrowRow: vi.fn(),
    fetchGrowRows: vi.fn(async () => []),
    insertGrowRow: vi.fn(async (row: GrowInsert) => ({ ...row, id: "g-new" })),
    updateGrowRow: vi.fn(async (id: string, patch: GrowUpdate) => ({ id, ...patch })),
    archiveGrow: vi.fn(async () => undefined),
    fetchDiaryEntryRows: vi.fn(async () => []),
    insertDiaryEntryRow: vi.fn(async (row: DiaryEntryInsert) => ({ ...row, id: "d-new" })),
    updateDiaryEntryRow: vi.fn(async (id: string, patch: DiaryEntryUpdate) => ({ id, ...patch })),
    deleteDiaryEntry: vi.fn(async () => undefined),
    fetchHarvestRows: vi.fn(async () => []),
    insertHarvestRow: vi.fn(async (row: HarvestInsert) => ({ ...row, id: "h-new" })),
    assignRole: vi.fn(async (row: UserRoleInsert) => ({ ...row, id: "r-new" })),
  };
});

import * as db from "@/lib/db";
import {
  PermissionError,
  type Caller,
  resolveCaller,
  hasRole,
  ownsRow,
  canAccessRow,
  listGrowsForCaller,
  getGrowForCaller,
  createGrowForCaller,
  updateGrowForCaller,
  archiveGrowForCaller,
  createDiaryEntryForCaller,
  updateDiaryEntryForCaller,
  deleteDiaryEntryForCaller,
  createHarvestForCaller,
  moderatePlantAsOperator,
  assignRoleAsOperator,
} from "./permissions";

const callerOf = (userId: string, roles: ("operator" | "customer")[] = []): Caller =>
  Object.freeze({ userId, roles: new Set(roles) });

const growRow = (row: Pick<GrowRow, "id" | "user_id">): GrowRow => row as unknown as GrowRow;

beforeEach(() => {
  authState.user = { id: "u-self" };
  authState.error = null;
  vi.clearAllMocks();
  updateMock.mockReturnValue({ eq: vi.fn(() => Promise.resolve({ error: null })) });
});

/* ------------------------------------------------------------------ */
//  resolveCaller
/* ------------------------------------------------------------------ */
describe("resolveCaller", () => {
  it("returns userId + roles for a signed-in user", async () => {
    vi.mocked(db.fetchUserRoles).mockResolvedValue(["operator"]);
    const caller = await resolveCaller();
    expect(caller.userId).toBe("u-self");
    expect(caller.roles.has("operator")).toBe(true);
  });

  it("throws PermissionError(unauthenticated) when there is no session", async () => {
    authState.user = null;
    await expect(resolveCaller()).rejects.toMatchObject({
      name: "PermissionError",
      code: "unauthenticated",
    });
  });

  it("throws PermissionError(unauthenticated) when getUser errors", async () => {
    authState.user = null;
    authState.error = { message: "jwt expired" };
    await expect(resolveCaller()).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

/* ------------------------------------------------------------------ */
//  Pure predicates
/* ------------------------------------------------------------------ */
describe("predicates", () => {
  it("hasRole reflects the cached role set", () => {
    expect(hasRole(callerOf("u", ["operator"]), "operator")).toBe(true);
    expect(hasRole(callerOf("u"), "operator")).toBe(false);
  });
  it("ownsRow compares user_id", () => {
    expect(ownsRow(callerOf("u-self"), { user_id: "u-self" })).toBe(true);
    expect(ownsRow(callerOf("u-self"), { user_id: "u-other" })).toBe(false);
  });
  it("canAccessRow returns true for owner OR operator", () => {
    expect(canAccessRow(callerOf("u-self"), { user_id: "u-self" })).toBe(true);
    expect(canAccessRow(callerOf("u-self", ["operator"]), { user_id: "u-other" })).toBe(true);
    expect(canAccessRow(callerOf("u-self"), { user_id: "u-other" })).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
//  Grows
/* ------------------------------------------------------------------ */
describe("grow guards", () => {
  it("listGrowsForCaller delegates to fetchGrowRows", async () => {
    await listGrowsForCaller(callerOf("u-self"));
    expect(db.fetchGrowRows).toHaveBeenCalled();
  });

  it("getGrowForCaller returns null when row missing", async () => {
    vi.mocked(db.fetchGrowRow).mockResolvedValue(null);
    expect(await getGrowForCaller(callerOf("u-self"), "g1")).toBeNull();
  });

  it("getGrowForCaller returns row for owner", async () => {
    vi.mocked(db.fetchGrowRow).mockResolvedValue(growRow({ id: "g1", user_id: "u-self" }));
    const r = await getGrowForCaller(callerOf("u-self"), "g1");
    expect(r?.id).toBe("g1");
  });

  it("getGrowForCaller blocks non-owner non-operator", async () => {
    vi.mocked(db.fetchGrowRow).mockResolvedValue(growRow({ id: "g1", user_id: "u-other" }));
    await expect(getGrowForCaller(callerOf("u-self"), "g1")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("getGrowForCaller allows operator on other-user row", async () => {
    vi.mocked(db.fetchGrowRow).mockResolvedValue(growRow({ id: "g1", user_id: "u-other" }));
    const r = await getGrowForCaller(callerOf("u-self", ["operator"]), "g1");
    expect(r?.id).toBe("g1");
  });

  it("createGrowForCaller forces user_id from caller", async () => {
    await createGrowForCaller(callerOf("u-self"), {
      name: "G",
      grow_type: "tent",
      stage: "veg",
    } satisfies Omit<GrowInsert, "user_id">);
    expect(db.insertGrowRow).toHaveBeenCalledWith(
      expect.objectContaining({ name: "G", user_id: "u-self" }),
    );
  });

  it("updateGrowForCaller blocks non-owner", async () => {
    vi.mocked(db.fetchGrowRow).mockResolvedValue(growRow({ id: "g1", user_id: "u-other" }));
    await expect(
      updateGrowForCaller(callerOf("u-self"), "g1", { name: "X" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(db.updateGrowRow).not.toHaveBeenCalled();
  });

  it("updateGrowForCaller strips user_id from the patch", async () => {
    vi.mocked(db.fetchGrowRow).mockResolvedValue(growRow({ id: "g1", user_id: "u-self" }));
    await updateGrowForCaller(callerOf("u-self"), "g1", {
      name: "X",
      user_id: "u-evil",
    } satisfies GrowUpdate);
    const [, patch] = vi.mocked(db.updateGrowRow).mock.calls[0];
    expect(patch).toEqual({ name: "X" });
    expect(patch).not.toHaveProperty("user_id");
  });

  it("archiveGrowForCaller blocks non-owner", async () => {
    vi.mocked(db.fetchGrowRow).mockResolvedValue(growRow({ id: "g1", user_id: "u-other" }));
    await expect(archiveGrowForCaller(callerOf("u-self"), "g1")).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(db.archiveGrow).not.toHaveBeenCalled();
  });

  it("archiveGrowForCaller archives when owner", async () => {
    vi.mocked(db.fetchGrowRow).mockResolvedValue(growRow({ id: "g1", user_id: "u-self" }));
    await archiveGrowForCaller(callerOf("u-self"), "g1");
    expect(db.archiveGrow).toHaveBeenCalledWith("g1");
  });
});

/* ------------------------------------------------------------------ */
//  Diary
/* ------------------------------------------------------------------ */
describe("diary guards", () => {
  it("createDiaryEntryForCaller forces user_id", async () => {
    await createDiaryEntryForCaller(callerOf("u-self"), {
      grow_id: "g1",
      note: "hi",
    } satisfies Omit<DiaryEntryInsert, "user_id">);
    expect(db.insertDiaryEntryRow).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u-self", note: "hi" }),
    );
  });

  it("updateDiaryEntryForCaller blocks non-owner", async () => {
    await expect(
      updateDiaryEntryForCaller(callerOf("u-self"), "d1", { note: "x" }, "u-other"),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(db.updateDiaryEntryRow).not.toHaveBeenCalled();
  });

  it("updateDiaryEntryForCaller strips user_id", async () => {
    await updateDiaryEntryForCaller(
      callerOf("u-self"),
      "d1",
      { note: "x", user_id: "u-evil" } satisfies DiaryEntryUpdate,
      "u-self",
    );
    const [, patch] = vi.mocked(db.updateDiaryEntryRow).mock.calls[0];
    expect(patch).not.toHaveProperty("user_id");
  });

  it("deleteDiaryEntryForCaller allows operator on other-user row", async () => {
    await deleteDiaryEntryForCaller(callerOf("u-self", ["operator"]), "d1", "u-other");
    expect(db.deleteDiaryEntry).toHaveBeenCalledWith("d1");
  });
});

/* ------------------------------------------------------------------ */
//  Harvests
/* ------------------------------------------------------------------ */
describe("harvest guards", () => {
  it("createHarvestForCaller forces user_id", async () => {
    await createHarvestForCaller(callerOf("u-self"), {
      grow_id: "g1",
      grow_type: "tent",
    } satisfies Omit<HarvestInsert, "user_id">);
    expect(db.insertHarvestRow).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u-self" }),
    );
  });
});

/* ------------------------------------------------------------------ */
//  Operator-only surfaces
/* ------------------------------------------------------------------ */
describe("operator-only guards", () => {
  it("moderatePlantAsOperator blocks non-operator", async () => {
    await expect(
      moderatePlantAsOperator(callerOf("u-self"), "p1", { health: "watch" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("moderatePlantAsOperator runs for operator", async () => {
    await moderatePlantAsOperator(callerOf("u-self", ["operator"]), "p1", { health: "watch" });
    expect(updateMock).toHaveBeenCalledWith({ health: "watch" });
  });

  it("assignRoleAsOperator blocks non-operator", async () => {
    await expect(
      assignRoleAsOperator(callerOf("u-self"), { user_id: "u2", role: "customer" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(db.assignRole).not.toHaveBeenCalled();
  });

  it("assignRoleAsOperator runs for operator", async () => {
    await assignRoleAsOperator(callerOf("u-self", ["operator"]), {
      user_id: "u2",
      role: "customer",
    });
    expect(db.assignRole).toHaveBeenCalledWith({ user_id: "u2", role: "customer" });
  });
});

/* ------------------------------------------------------------------ */
//  Error contract
/* ------------------------------------------------------------------ */
describe("PermissionError", () => {
  it("carries a stable code and name for callers to switch on", () => {
    const err = new PermissionError("forbidden", "test", "why");
    expect(err.name).toBe("PermissionError");
    expect(err.code).toBe("forbidden");
    expect(err.message).toMatch(/permissions\.test: forbidden \(why\)/);
  });
});

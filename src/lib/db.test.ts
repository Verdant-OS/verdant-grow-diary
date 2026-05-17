import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable fake Supabase query builder.
type Result = { data: unknown; error: unknown };
let nextResult: Result = { data: [], error: null };
const calls: {
  table?: string;
  filters: Array<[string, unknown]>;
  ordered?: string;
  limited?: number;
  inserted?: unknown;
  updated?: unknown;
  deleted?: boolean;
  single?: boolean;
  upserted?: unknown;
} = {
  filters: [],
  deleted: false,
};

function reset() {
  nextResult = { data: [], error: null };
  calls.table = undefined;
  calls.filters = [];
  calls.ordered = undefined;
  calls.limited = undefined;
  calls.inserted = undefined;
  calls.updated = undefined;
  calls.deleted = false;
  calls.single = false;
  calls.upserted = undefined;
}

function builder() {
  const b: any = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      calls.filters.push([col, val]);
      return b;
    },
    order: (col: string, _opts?: unknown) => {
      calls.ordered = col;
      return b;
    },
    limit: (n: number) => {
      calls.limited = n;
      return b;
    },
    maybeSingle: () => {
      calls.single = true;
      return Promise.resolve(nextResult);
    },
    single: () => Promise.resolve(nextResult),
    insert: (row: unknown) => {
      calls.inserted = row;
      return b;
    },
    update: (patch: unknown) => {
      calls.updated = patch;
      return b;
    },
    upsert: (row: unknown) => {
      calls.upserted = row;
      return b;
    },
    delete: () => {
      calls.deleted = true;
      return b;
    },
    then: (resolve: (r: Result) => unknown) => Promise.resolve(nextResult).then(resolve),
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      calls.table = table;
      return builder();
    },
  },
}));

import {
  fetchGrowRows,
  fetchGrowRow,
  insertGrowRow,
  updateGrowRow,
  archiveGrow,
  fetchDiaryEntryRows,
  insertDiaryEntryRow,
  updateDiaryEntryRow,
  deleteDiaryEntry,
  fetchHarvestRows,
  insertHarvestRow,
  fetchProfileRow,
  upsertProfileRow,
  fetchUserRoles,
  assignRole,
  fetchUnlockRows,
  fetchUserQuestRows,
} from "./db";

beforeEach(reset);

const growRow = {
  id: "g1",
  user_id: "u1",
  name: "Summer 2026",
  grow_type: "tent",
  stage: "flower",
  started_at: "2026-03-01T00:00:00Z",
  notes: null,
  is_archived: false,
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
};

/* ------------------------------------------------------------------ */
//  Grows
/* ------------------------------------------------------------------ */
describe("fetchGrowRows", () => {
  it("returns rows on success", async () => {
    nextResult = { data: [growRow], error: null };
    const rows = await fetchGrowRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("g1");
    expect(calls.table).toBe("grows");
    expect(calls.filters).toContainEqual(["is_archived", false]);
  });
  it("returns [] when data is null", async () => {
    nextResult = { data: null, error: null };
    expect(await fetchGrowRows()).toEqual([]);
  });
  it("throws on error", async () => {
    nextResult = { data: null, error: { message: "boom" } };
    await expect(fetchGrowRows()).rejects.toThrow(/db.fetchGrowRows.*boom/);
  });
});

describe("fetchGrowRow", () => {
  it("returns null for empty id", async () => {
    expect(await fetchGrowRow("")).toBeNull();
    expect(calls.table).toBeUndefined();
  });
  it("returns a row when found", async () => {
    nextResult = { data: growRow, error: null };
    const r = await fetchGrowRow("g1");
    expect(r?.name).toBe("Summer 2026");
    expect(calls.table).toBe("grows");
    expect(calls.single).toBe(true);
  });
  it("returns null when missing", async () => {
    nextResult = { data: null, error: null };
    expect(await fetchGrowRow("g1")).toBeNull();
  });
});

describe("insertGrowRow", () => {
  it("inserts and returns the row", async () => {
    nextResult = { data: growRow, error: null };
    const r = await insertGrowRow({
      user_id: "u1",
      name: "Summer 2026",
      grow_type: "tent",
      stage: "flower",
    });
    expect(calls.table).toBe("grows");
    expect(calls.inserted).toMatchObject({ name: "Summer 2026" });
    expect(r.id).toBe("g1");
  });
  it("throws on error", async () => {
    nextResult = { data: null, error: { message: "denied" } };
    await expect(
      insertGrowRow({ user_id: "u1", name: "X", grow_type: "tent", stage: "seedling" }),
    ).rejects.toThrow(/db.insertGrowRow.*denied/);
  });
});

describe("updateGrowRow", () => {
  it("patches and returns the row", async () => {
    nextResult = { data: { ...growRow, name: "Renamed" }, error: null };
    const r = await updateGrowRow("g1", { name: "Renamed" });
    expect(calls.table).toBe("grows");
    expect(calls.updated).toMatchObject({ name: "Renamed" });
    expect(calls.filters).toContainEqual(["id", "g1"]);
    expect(r.name).toBe("Renamed");
  });
});

describe("archiveGrow", () => {
  it("sets is_archived to true", async () => {
    nextResult = { data: null, error: null };
    await archiveGrow("g1");
    expect(calls.table).toBe("grows");
    expect(calls.updated).toMatchObject({ is_archived: true });
    expect(calls.filters).toContainEqual(["id", "g1"]);
  });
});

/* ------------------------------------------------------------------ */
//  Diary Entries
/* ------------------------------------------------------------------ */
const diaryRow = {
  id: "d1",
  user_id: "u1",
  grow_id: "g1",
  note: "Topped today",
  stage: "veg",
  details: {},
  entry_at: "2026-04-01T12:00:00Z",
  photo_url: null,
  created_at: "2026-04-01T12:00:00Z",
};

describe("fetchDiaryEntryRows", () => {
  it("returns rows for a grow", async () => {
    nextResult = { data: [diaryRow], error: null };
    const rows = await fetchDiaryEntryRows("g1");
    expect(rows).toHaveLength(1);
    expect(calls.table).toBe("diary_entries");
    expect(calls.filters).toContainEqual(["grow_id", "g1"]);
  });
  it("returns all rows when no growId", async () => {
    nextResult = { data: [diaryRow], error: null };
    await fetchDiaryEntryRows();
    expect(calls.filters).toEqual([]);
  });
});

describe("insertDiaryEntryRow", () => {
  it("inserts and returns the row", async () => {
    nextResult = { data: diaryRow, error: null };
    const r = await insertDiaryEntryRow({
      user_id: "u1",
      grow_id: "g1",
      note: "Topped today",
    });
    expect(calls.table).toBe("diary_entries");
    expect(r.note).toBe("Topped today");
  });
});

describe("updateDiaryEntryRow", () => {
  it("updates the note", async () => {
    nextResult = { data: { ...diaryRow, note: "Updated" }, error: null };
    const r = await updateDiaryEntryRow("d1", { note: "Updated" });
    expect(calls.updated).toMatchObject({ note: "Updated" });
    expect(r.note).toBe("Updated");
  });
});

describe("deleteDiaryEntry", () => {
  it("deletes by id", async () => {
    nextResult = { data: null, error: null };
    await deleteDiaryEntry("d1");
    expect(calls.deleted).toBe(true);
    expect(calls.filters).toContainEqual(["id", "d1"]);
  });
});

/* ------------------------------------------------------------------ */
//  Harvests
/* ------------------------------------------------------------------ */
const harvestRow = {
  id: "h1",
  user_id: "u1",
  grow_id: "g1",
  grow_type: "tent",
  harvested_at: "2026-06-01T00:00:00Z",
  yield_grams: null,
  medium: null,
  notes: null,
  created_at: "2026-06-01T00:00:00Z",
};

describe("fetchHarvestRows", () => {
  it("filters by grow_id when provided", async () => {
    nextResult = { data: [harvestRow], error: null };
    const rows = await fetchHarvestRows("g1");
    expect(rows).toHaveLength(1);
    expect(calls.filters).toContainEqual(["grow_id", "g1"]);
  });
});

describe("insertHarvestRow", () => {
  it("inserts and returns the row", async () => {
    nextResult = { data: harvestRow, error: null };
    const r = await insertHarvestRow({
      user_id: "u1",
      grow_id: "g1",
      grow_type: "tent",
    });
    expect(calls.table).toBe("harvests");
    expect(r.grow_id).toBe("g1");
  });
});

/* ------------------------------------------------------------------ */
//  Profiles
/* ------------------------------------------------------------------ */
const profileRow = {
  user_id: "u1",
  display_name: "Alex",
  level: 3,
  tier: "seedling",
  nugs_total: 1200,
  current_badge: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("fetchProfileRow", () => {
  it("returns null for empty userId", async () => {
    expect(await fetchProfileRow("")).toBeNull();
  });
  it("returns a profile when found", async () => {
    nextResult = { data: profileRow, error: null };
    const r = await fetchProfileRow("u1");
    expect(r?.display_name).toBe("Alex");
    expect(calls.filters).toContainEqual(["user_id", "u1"]);
  });
});

describe("upsertProfileRow", () => {
  it("upserts and returns the row", async () => {
    nextResult = { data: profileRow, error: null };
    const r = await upsertProfileRow({ user_id: "u1", display_name: "Alex" });
    expect(calls.table).toBe("profiles");
    expect(calls.upserted).toMatchObject({ user_id: "u1" });
    expect(r.user_id).toBe("u1");
  });
});

/* ------------------------------------------------------------------ */
//  User Roles
/* ------------------------------------------------------------------ */
describe("fetchUserRoles", () => {
  it("returns [] for empty userId", async () => {
    expect(await fetchUserRoles("")).toEqual([]);
  });
  it("extracts roles from rows", async () => {
    nextResult = { data: [{ role: "operator" }, { role: "customer" }], error: null };
    const roles = await fetchUserRoles("u1");
    expect(roles).toEqual(["operator", "customer"]);
  });
});

describe("assignRole", () => {
  it("inserts a role", async () => {
    nextResult = { data: { id: "r1", user_id: "u1", role: "customer" }, error: null };
    const r = await assignRole({ user_id: "u1", role: "customer" });
    expect(calls.table).toBe("user_roles");
    expect(calls.inserted).toMatchObject({ role: "customer" });
    expect(r.role).toBe("customer");
  });
});

/* ------------------------------------------------------------------ */
//  Unlocks & Quests
/* ------------------------------------------------------------------ */
describe("fetchUnlockRows", () => {
  it("returns rows for a user", async () => {
    nextResult = { data: [{ id: "ul1", user_id: "u1", key: "grow_badge" }], error: null };
    const rows = await fetchUnlockRows("u1");
    expect(rows).toHaveLength(1);
    expect(calls.filters).toContainEqual(["user_id", "u1"]);
  });
});

describe("fetchUserQuestRows", () => {
  it("returns rows for a user", async () => {
    nextResult = { data: [{ id: "q1", user_id: "u1", quest_key: "first_harvest" }], error: null };
    const rows = await fetchUserQuestRows("u1");
    expect(rows).toHaveLength(1);
    expect(calls.filters).toContainEqual(["user_id", "u1"]);
  });
});

import { describe, it, expect, vi } from "vitest";
import { retirePreviousPlantProfilePhoto } from "@/lib/plantProfilePhotoReplacementCleanupService";

const USER = "user-1";
const PLANT = "plant-9";
const NEW_REF = `storage://diary-photos/${USER}/g/plant-profiles/${PLANT}/new.jpg`;
const OLD_REF = `storage://diary-photos/${USER}/g/plant-profiles/${PLANT}/old.jpg`;
const OLD_PATH = `${USER}/g/plant-profiles/${PLANT}/old.jpg`;

interface Scenario {
  currentPhoto?: string | null;
  currentError?: unknown;
  refRows?: Array<{ id: string; photo_url: string }>;
  refError?: unknown;
  throwOnCurrent?: boolean;
  throwOnRef?: boolean;
}

function makeClient(s: Scenario) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: string) {
              if (col === "id") {
                if (s.throwOnCurrent) throw new Error("boom");
                if (s.currentError) {
                  return Promise.resolve({ data: null, error: s.currentError });
                }
                if (val !== PLANT) {
                  return Promise.resolve({ data: [], error: null });
                }
                return Promise.resolve({
                  data:
                    s.currentPhoto === undefined
                      ? []
                      : [{ id: PLANT, photo_url: s.currentPhoto }],
                  error: null,
                });
              }
              // photo_url reference query
              if (s.throwOnRef) throw new Error("ref-boom");
              if (s.refError) {
                return Promise.resolve({ data: null, error: s.refError });
              }
              return Promise.resolve({ data: s.refRows ?? [], error: null });
            },
          };
        },
      };
    },
  };
}

async function run(s: Scenario, remove = vi.fn(async () => ({ ok: true }))) {
  const result = await retirePreviousPlantProfilePhoto({
    previousPhotoUrl: OLD_REF,
    newPhotoUrl: NEW_REF,
    authenticatedUserId: USER,
    plantId: PLANT,
    client: makeClient(s),
    remove,
  });
  return { result, remove };
}

describe("retirePreviousPlantProfilePhoto", () => {
  it("removes only when new is persisted AND zero remaining references", async () => {
    const { result, remove } = await run({ currentPhoto: NEW_REF, refRows: [] });
    expect(result).toEqual({ status: "removed" });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(OLD_PATH);
  });

  it("passes only the parsed object path (no bucket, no scheme)", async () => {
    const { remove } = await run({ currentPhoto: NEW_REF, refRows: [] });
    const arg = remove.mock.calls[0][0] as string;
    expect(arg.startsWith("storage://")).toBe(false);
    expect(arg.startsWith("diary-photos/")).toBe(false);
  });

  it("persistence unconfirmed (row missing) → skipped_for_safety, no removal", async () => {
    const remove = vi.fn(async () => ({ ok: true }));
    const { result } = await run({ currentPhoto: undefined }, remove);
    expect(result).toEqual({
      status: "skipped_for_safety",
      reason: "persistence_unconfirmed",
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("persistence mismatch (row has different photo_url) → skipped_for_safety", async () => {
    const remove = vi.fn(async () => ({ ok: true }));
    const { result } = await run(
      { currentPhoto: "https://legacy/x.jpg" },
      remove,
    );
    expect(result).toEqual({
      status: "skipped_for_safety",
      reason: "persistence_unconfirmed",
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("persistence lookup errors → skipped_for_safety, no removal", async () => {
    const remove = vi.fn(async () => ({ ok: true }));
    const { result } = await run(
      { currentError: { message: "db" } },
      remove,
    );
    expect(result).toEqual({
      status: "skipped_for_safety",
      reason: "persistence_unconfirmed",
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("persistence lookup throws → skipped_for_safety", async () => {
    const remove = vi.fn(async () => ({ ok: true }));
    const { result } = await run({ throwOnCurrent: true }, remove);
    expect(result.status).toBe("skipped_for_safety");
    expect(remove).not.toHaveBeenCalled();
  });

  it("reference-query failure → skipped_for_safety, no removal", async () => {
    const remove = vi.fn(async () => ({ ok: true }));
    const { result } = await run(
      { currentPhoto: NEW_REF, refError: { message: "db" } },
      remove,
    );
    expect(result).toEqual({
      status: "skipped_for_safety",
      reason: "reference_check_failed",
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("reference-query throws → skipped_for_safety", async () => {
    const remove = vi.fn(async () => ({ ok: true }));
    const { result } = await run(
      { currentPhoto: NEW_REF, throwOnRef: true },
      remove,
    );
    expect(result.status).toBe("skipped_for_safety");
    expect(remove).not.toHaveBeenCalled();
  });

  it("one remaining reference → protected, no removal", async () => {
    const remove = vi.fn(async () => ({ ok: true }));
    const { result } = await run(
      {
        currentPhoto: NEW_REF,
        refRows: [{ id: "other-plant", photo_url: OLD_REF }],
      },
      remove,
    );
    expect(result).toEqual({ status: "protected", reason: "still_referenced" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("multiple remaining references → protected", async () => {
    const remove = vi.fn(async () => ({ ok: true }));
    const { result } = await run(
      {
        currentPhoto: NEW_REF,
        refRows: [
          { id: "a", photo_url: OLD_REF },
          { id: "b", photo_url: OLD_REF },
        ],
      },
      remove,
    );
    expect(result.status).toBe("protected");
    expect(remove).not.toHaveBeenCalled();
  });

  it("remove failure returns sanitized remove_failed", async () => {
    const remove = vi.fn(async () => ({ ok: false }));
    const { result } = await run({ currentPhoto: NEW_REF, refRows: [] }, remove);
    expect(result).toEqual({ status: "remove_failed" });
  });

  it("legacy (http) previous → not_needed with no storage query", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn() })),
      })),
    };
    const remove = vi.fn(async () => ({ ok: true }));
    const result = await retirePreviousPlantProfilePhoto({
      previousPhotoUrl: "https://legacy.example/x.jpg",
      newPhotoUrl: NEW_REF,
      authenticatedUserId: USER,
      plantId: PLANT,
      client,
      remove,
    });
    expect(result).toEqual({
      status: "not_needed",
      reason: "legacy_reference",
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("wrong-owner previous → skipped_for_safety (never queries or removes)", async () => {
    const client = { from: vi.fn(() => ({ select: vi.fn() })) };
    const remove = vi.fn(async () => ({ ok: true }));
    const result = await retirePreviousPlantProfilePhoto({
      previousPhotoUrl: `storage://diary-photos/someone-else/g/plant-profiles/${PLANT}/x.jpg`,
      newPhotoUrl: NEW_REF,
      authenticatedUserId: USER,
      plantId: PLANT,
      client,
      remove,
    });
    expect(result).toEqual({
      status: "skipped_for_safety",
      reason: "ineligible_reference",
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("same previous and new → not_needed, no storage side-effects", async () => {
    const client = { from: vi.fn(() => ({ select: vi.fn() })) };
    const remove = vi.fn(async () => ({ ok: true }));
    const result = await retirePreviousPlantProfilePhoto({
      previousPhotoUrl: NEW_REF,
      newPhotoUrl: NEW_REF,
      authenticatedUserId: USER,
      plantId: PLANT,
      client,
      remove,
    });
    expect(result.status).toBe("not_needed");
    expect(client.from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("plantProfilePhotoReplacementCleanupService · static safety", () => {
  it("does not import a service-role client or the admin cleanup CLI", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL(
        "../lib/plantProfilePhotoReplacementCleanupService.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/SERVICE_ROLE/);
    expect(src).not.toMatch(/scripts\/admin/);
    expect(src).not.toMatch(/plant-photos-cleanup/);
  });
});

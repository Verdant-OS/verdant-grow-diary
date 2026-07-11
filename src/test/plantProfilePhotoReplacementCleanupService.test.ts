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
    const arg = (remove.mock.calls[0] as unknown as [string])[0];
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
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "../lib/plantProfilePhotoReplacementCleanupService.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/SERVICE_ROLE/);
    expect(src).not.toMatch(/scripts\/admin/);
    expect(src).not.toMatch(/plant-photos-cleanup/);
  });
});

// ---------------------------------------------------------------------------
// Race + shared-reference regression tests
// ---------------------------------------------------------------------------

/**
 * Builder for a stateful mock of the tiny Supabase surface the service
 * touches. Backed by a mutable map of plantId -> current photo_url so
 * tests can simulate concurrent replacements changing the persisted
 * value between operations.
 */
interface StatefulOpts {
  plants: Record<string, string | null>;
  onIdQuery?: (plantId: string) => Promise<void> | void;
  onRefQuery?: (photoUrl: string) => Promise<void> | void;
  calls: {
    idQueries: string[];
    refQueries: string[];
  };
}

function makeStatefulClient(opts: StatefulOpts) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: string) {
              if (col === "id") {
                opts.calls.idQueries.push(val);
                const gate = opts.onIdQuery?.(val);
                const resolve = () => {
                  const cur = opts.plants[val];
                  if (cur === undefined) {
                    return { data: [], error: null };
                  }
                  return {
                    data: [{ id: val, photo_url: cur }],
                    error: null,
                  };
                };
                return Promise.resolve(gate).then(resolve);
              }
              // photo_url reference query
              opts.calls.refQueries.push(val);
              const gate = opts.onRefQuery?.(val);
              const resolve = () => {
                const rows = Object.entries(opts.plants)
                  .filter(([, url]) => url === val)
                  .map(([id, url]) => ({ id, photo_url: url as string }));
                return { data: rows, error: null };
              };
              return Promise.resolve(gate).then(resolve);
            },
          };
        },
      };
    },
  };
}

describe("retirePreviousPlantProfilePhoto · rapid-replacement race", () => {
  const photo0 = `storage://diary-photos/${USER}/g/plant-profiles/${PLANT}/photo0.jpg`;
  const photo1 = `storage://diary-photos/${USER}/g/plant-profiles/${PLANT}/photo1.jpg`;
  const photo2 = `storage://diary-photos/${USER}/g/plant-profiles/${PLANT}/photo2.jpg`;
  const path1 = `${USER}/g/plant-profiles/${PLANT}/photo1.jpg`;

  it("stale Replacement A (photo0→photo1) cannot delete once photo2 is persisted", async () => {
    // Deferred gate: Replacement A begins persistence confirmation, B
    // persists photo2, then A resumes and sees photo2 rather than photo1.
    let releaseA: () => void = () => {};
    const aStarted = new Promise<void>((res) => {
      releaseA = res;
    });
    let aHasStartedFlag = false;
    const bDoneSignal: { done: boolean } = { done: false };

    const calls = { idQueries: [] as string[], refQueries: [] as string[] };
    const state: Record<string, string | null> = { [PLANT]: photo1 };
    const removeA = vi.fn(async () => ({ ok: true }));

    const clientA = makeStatefulClient({
      plants: state,
      calls,
      onIdQuery: async () => {
        if (!aHasStartedFlag) {
          aHasStartedFlag = true;
          releaseA();
          // Wait for B to persist photo2 before A's id-query resolves.
          await new Promise<void>((res) => {
            const check = () => (bDoneSignal.done ? res() : setTimeout(check, 1));
            check();
          });
        }
      },
    });

    const aPromise = retirePreviousPlantProfilePhoto({
      previousPhotoUrl: photo0,
      newPhotoUrl: photo1,
      authenticatedUserId: USER,
      plantId: PLANT,
      client: clientA,
      remove: removeA,
    });

    await aStarted;
    // Replacement B lands: mutate persisted state to photo2.
    state[PLANT] = photo2;
    bDoneSignal.done = true;

    const aResult = await aPromise;

    expect(aResult).toEqual({
      status: "skipped_for_safety",
      reason: "persistence_unconfirmed",
    });
    // Stale A must NOT progress to the reference-count query.
    expect(calls.refQueries).toEqual([]);
    expect(removeA).not.toHaveBeenCalled();
    // photo2 remains the persisted value, untouched.
    expect(state[PLANT]).toBe(photo2);
  });

  it("current Replacement B (photo1→photo2) deletes exactly photo1 by parsed path", async () => {
    const calls = { idQueries: [] as string[], refQueries: [] as string[] };
    const state: Record<string, string | null> = { [PLANT]: photo2 };
    const removeB = vi.fn(async () => ({ ok: true }));
    const clientB = makeStatefulClient({ plants: state, calls });

    const result = await retirePreviousPlantProfilePhoto({
      previousPhotoUrl: photo1,
      newPhotoUrl: photo2,
      authenticatedUserId: USER,
      plantId: PLANT,
      client: clientB,
      remove: removeB,
    });

    expect(result).toEqual({ status: "removed" });
    expect(calls.idQueries).toEqual([PLANT]);
    expect(calls.refQueries).toEqual([photo1]);
    expect(removeB).toHaveBeenCalledTimes(1);
    expect(removeB).toHaveBeenCalledWith(path1);

    // Race invariants: photo0 is never touched by B; the parsed path
    // is bucket-relative (no scheme, no bucket prefix).
    const arg = (removeB.mock.calls[0] as unknown as [string])[0];
    expect(arg).toBe(path1);
    expect(arg.startsWith("storage://")).toBe(false);
    expect(arg.startsWith("diary-photos/")).toBe(false);
    expect(arg.includes("photo0")).toBe(false);
    expect(arg.includes("photo2")).toBe(false);
    // The bucket the service targets is exactly "diary-photos" — proven
    // by the parsed path parent segments used by removeUploadedPlantProfilePhoto.
  });

  it("persistence check strictly precedes reference-count query", async () => {
    const calls = { idQueries: [] as string[], refQueries: [] as string[] };
    const state: Record<string, string | null> = { [PLANT]: photo2 };
    // Order guard: fail if refQuery fires before idQuery resolves.
    let idResolved = false;
    const client = makeStatefulClient({
      plants: state,
      calls,
      onIdQuery: async () => {
        await Promise.resolve();
        idResolved = true;
      },
      onRefQuery: () => {
        expect(idResolved).toBe(true);
      },
    });
    const remove = vi.fn(async () => ({ ok: true }));
    const result = await retirePreviousPlantProfilePhoto({
      previousPhotoUrl: photo1,
      newPhotoUrl: photo2,
      authenticatedUserId: USER,
      plantId: PLANT,
      client,
      remove,
    });
    expect(result.status).toBe("removed");
    expect(calls.idQueries.length).toBe(1);
    expect(calls.refQueries.length).toBe(1);
  });
});

describe("retirePreviousPlantProfilePhoto · shared previous reference", () => {
  const plantA = "plant-A";
  const plantB = "plant-B";
  const sharedPhoto = `storage://diary-photos/${USER}/g/plant-profiles/${plantA}/shared.jpg`;
  const sharedPath = `${USER}/g/plant-profiles/${plantA}/shared.jpg`;
  const photoA2 = `storage://diary-photos/${USER}/g/plant-profiles/${plantA}/next.jpg`;
  const photoB2 = `storage://diary-photos/${USER}/g/plant-profiles/${plantB}/next.jpg`;

  it("Plant A replacement leaves shared object protected while Plant B still references it", async () => {
    const calls = { idQueries: [] as string[], refQueries: [] as string[] };
    // Plant A already persisted its new photo; Plant B still holds shared.
    const state: Record<string, string | null> = {
      [plantA]: photoA2,
      [plantB]: sharedPhoto,
    };
    const remove = vi.fn(async () => ({ ok: true }));
    const client = makeStatefulClient({ plants: state, calls });

    const result = await retirePreviousPlantProfilePhoto({
      previousPhotoUrl: sharedPhoto,
      newPhotoUrl: photoA2,
      authenticatedUserId: USER,
      plantId: plantA,
      client,
      remove,
    });

    expect(result).toEqual({ status: "protected", reason: "still_referenced" });
    expect(calls.refQueries).toEqual([sharedPhoto]);
    expect(remove).not.toHaveBeenCalled();
    // Plant A's new reference is NOT rolled back.
    expect(state[plantA]).toBe(photoA2);
    // Shared object still referenced by Plant B.
    expect(state[plantB]).toBe(sharedPhoto);
  });

  it("Plant B replacement removes shared object only after count reaches zero", async () => {
    const calls = { idQueries: [] as string[], refQueries: [] as string[] };
    // Plant A already moved to photoA2; Plant B now moves to photoB2.
    const state: Record<string, string | null> = {
      [plantA]: photoA2,
      [plantB]: photoB2,
    };
    const remove = vi.fn(async () => ({ ok: true }));
    const client = makeStatefulClient({ plants: state, calls });

    const result = await retirePreviousPlantProfilePhoto({
      previousPhotoUrl: sharedPhoto,
      newPhotoUrl: photoB2,
      authenticatedUserId: USER,
      plantId: plantB,
      client,
      remove,
    });

    expect(result).toEqual({ status: "removed" });
    expect(calls.refQueries).toEqual([sharedPhoto]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(sharedPath);
    const arg = (remove.mock.calls[0] as unknown as [string])[0];
    expect(arg.startsWith("storage://")).toBe(false);
    expect(arg.includes(photoA2)).toBe(false);
    expect(arg.includes(photoB2)).toBe(false);
    // Neither replacement's new reference was disturbed.
    expect(state[plantA]).toBe(photoA2);
    expect(state[plantB]).toBe(photoB2);
  });

  it("shared-reference invariant: count>0 protects, count=0 permits", async () => {
    // count>0 branch
    {
      const calls = { idQueries: [] as string[], refQueries: [] as string[] };
      const state: Record<string, string | null> = {
        [plantA]: photoA2,
        [plantB]: sharedPhoto,
      };
      const remove = vi.fn(async () => ({ ok: true }));
      const client = makeStatefulClient({ plants: state, calls });
      const r = await retirePreviousPlantProfilePhoto({
        previousPhotoUrl: sharedPhoto,
        newPhotoUrl: photoA2,
        authenticatedUserId: USER,
        plantId: plantA,
        client,
        remove,
      });
      expect(r.status).toBe("protected");
      expect(remove).not.toHaveBeenCalled();
    }
    // count=0 branch
    {
      const calls = { idQueries: [] as string[], refQueries: [] as string[] };
      const state: Record<string, string | null> = {
        [plantA]: photoA2,
        [plantB]: photoB2,
      };
      const remove = vi.fn(async () => ({ ok: true }));
      const client = makeStatefulClient({ plants: state, calls });
      const r = await retirePreviousPlantProfilePhoto({
        previousPhotoUrl: sharedPhoto,
        newPhotoUrl: photoB2,
        authenticatedUserId: USER,
        plantId: plantB,
        client,
        remove,
      });
      expect(r.status).toBe("removed");
      expect(remove).toHaveBeenCalledTimes(1);
    }
  });
});

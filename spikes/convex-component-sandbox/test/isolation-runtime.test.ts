import { describe, expect, it, vi } from "vitest";

import { createHarness, HASH_A, mountedComponents, rootInternal } from "./harness";

describe("component namespace isolation", () => {
  it("P5 cannot observe a parent grower_notes row from the component namespace", async () => {
    const t = createHarness();

    await t.mutation(rootInternal.notes.insertSynthetic, {
      body: "PARENT_SECRET_MUST_NOT_LEAK",
      createdAt: 1_000,
    });

    await expect(
      t.query(mountedComponents.abuse_guard.isolationProbe.attemptParentTableRead, {}),
    ).resolves.toBeNull();
    await expect(t.query(rootInternal.notes.readSynthetic, {})).resolves.toEqual([
      { body: "PARENT_SECRET_MUST_NOT_LEAK", createdAt: 1_000 },
    ]);
  });

  it("P6 rejects a parent attempt to patch a component bucket", async () => {
    const t = createHarness();
    await t.mutation(rootInternal.notes.insertSynthetic, {
      body: "PARENT_SECRET_MUST_NOT_LEAK",
      createdAt: 1_000,
    });
    await t.mutation(mountedComponents.abuse_guard.check.consume, {
      keyHash: HASH_A,
      nowMs: 1_000,
      windowMs: 60_000,
      max: 5,
    });
    const componentBucketId = await t.query(
      mountedComponents.abuse_guard.isolationProbe.getFirstBucketId,
      {},
    );
    expect(componentBucketId).toEqual(expect.any(String));
    if (typeof componentBucketId !== "string") {
      throw new Error("P6 setup failed to create a component bucket ID");
    }

    await expect(
      t.mutation(rootInternal.componentMutationProbe.attemptDirectComponentPatch, {
        componentBucketId,
      }),
    ).rejects.toThrow(/non-existent document/i);
    await expect(
      t.query(mountedComponents.abuse_guard.check.snapshot, {
        keyHash: HASH_A,
        nowMs: 1_000,
        windowMs: 60_000,
      }),
    ).resolves.toEqual({ count: 1 });
    await expect(t.query(rootInternal.notes.readSynthetic, {})).resolves.toEqual([
      { body: "PARENT_SECRET_MUST_NOT_LEAK", createdAt: 1_000 },
    ]);
  });

  it("P7 passes only an opaque hash and numbers across the parent bridge", async () => {
    vi.stubEnv("CONVEX_SANDBOX_PEPPER", "test-pepper-not-a-secret");
    const t = createHarness();
    await t.mutation(rootInternal.notes.insertSynthetic, {
      body: "PARENT_SECRET_MUST_NOT_LEAK",
      createdAt: 1_000,
    });

    await expect(
      t.mutation(rootInternal.guardBridge.consumeForSubject, {
        subjectKey: "synthetic-subject",
        nowMs: 1_000,
      }),
    ).resolves.toEqual({ status: "allow", remaining: 4 });

    const buckets = await t.query(mountedComponents.abuse_guard.isolationProbe.listBuckets, {});
    expect(buckets).toHaveLength(1);
    expect(JSON.stringify(buckets)).not.toContain("PARENT_SECRET_MUST_NOT_LEAK");
    expect(JSON.stringify(buckets)).not.toContain("synthetic-subject");
    expect(buckets[0]).toEqual({
      keyHash: "2fb77e0820769e6c3ba21e36ce26462f33813c9379f7f412840d15119723cd19",
      windowStartMs: 0,
      count: 1,
    });
  });
});

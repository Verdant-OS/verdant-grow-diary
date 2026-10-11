import { describe, expect, it, vi } from "vitest";
import { runAuthOAuthBootstrap } from "@/lib/authOAuthBootstrapService";

describe("runAuthOAuthBootstrap", () => {
  it("runs consume once and resolves when it completes", async () => {
    const client = {};
    const consume = vi.fn(async () => "fixture-result");

    await expect(runAuthOAuthBootstrap(client, consume)).resolves.toBeUndefined();
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("returns the same in-flight promise for concurrent calls on one client", async () => {
    const client = {};
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const consume = vi.fn(async () => {
      await gate;
    });

    const first = runAuthOAuthBootstrap(client, consume);
    const second = runAuthOAuthBootstrap(client, consume);
    expect(second).toBe(first);

    release();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh consumption after the previous promise settles", async () => {
    const client = {};
    const consume = vi.fn(async () => undefined);

    await runAuthOAuthBootstrap(client, consume);
    await runAuthOAuthBootstrap(client, consume);

    expect(consume).toHaveBeenCalledTimes(2);
  });

  it("tracks pending consumption independently per auth client", async () => {
    const left = {};
    const right = {};
    const leftConsume = vi.fn(async () => undefined);
    const rightConsume = vi.fn(async () => undefined);

    await Promise.all([
      runAuthOAuthBootstrap(left, leftConsume),
      runAuthOAuthBootstrap(right, rightConsume),
    ]);

    expect(leftConsume).toHaveBeenCalledTimes(1);
    expect(rightConsume).toHaveBeenCalledTimes(1);
  });

  it("propagates consume failures to every waiter", async () => {
    const client = {};
    const failure = new Error("fixture oauth consume failed");
    const consume = vi.fn(async () => {
      throw failure;
    });

    const first = runAuthOAuthBootstrap(client, consume);
    const second = runAuthOAuthBootstrap(client, consume);
    await expect(first).rejects.toThrow("fixture oauth consume failed");
    await expect(second).rejects.toThrow("fixture oauth consume failed");
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("clears the pending entry even when consume rejects", async () => {
    const client = {};
    const consume = vi
      .fn()
      .mockRejectedValueOnce(new Error("first attempt failed"))
      .mockResolvedValueOnce(undefined);

    await expect(runAuthOAuthBootstrap(client, consume)).rejects.toThrow("first attempt failed");
    await expect(runAuthOAuthBootstrap(client, consume)).resolves.toBeUndefined();
    expect(consume).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it, vi } from "vitest";
import { runAuthOAuthBootstrap } from "@/lib/authOAuthBootstrapService";

describe("runAuthOAuthBootstrap", () => {
  it("runs consume once and resolves when it completes", async () => {
    const client = {};
    const consume = vi.fn(async () => "done");

    await expect(runAuthOAuthBootstrap(client, consume)).resolves.toBeUndefined();
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("returns the same in-flight promise for the same client", async () => {
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

    expect(first).toBe(second);
    await Promise.resolve();
    expect(consume).toHaveBeenCalledTimes(1);

    release();
    await expect(first).resolves.toBeUndefined();
  });

  it("allows a new consumption after the prior one settles", async () => {
    const client = {};
    const consume = vi.fn(async () => undefined);

    await runAuthOAuthBootstrap(client, consume);
    await runAuthOAuthBootstrap(client, consume);

    expect(consume).toHaveBeenCalledTimes(2);
  });

  it("tracks pending consumption independently per auth client", async () => {
    const clientA = {};
    const clientB = {};
    const consumeA = vi.fn(async () => "a");
    const consumeB = vi.fn(async () => "b");

    await Promise.all([
      runAuthOAuthBootstrap(clientA, consumeA),
      runAuthOAuthBootstrap(clientB, consumeB),
    ]);

    expect(consumeA).toHaveBeenCalledTimes(1);
    expect(consumeB).toHaveBeenCalledTimes(1);
  });

  it("clears the in-flight entry after rejection so retry can run", async () => {
    const client = {};
    const consume = vi
      .fn()
      .mockRejectedValueOnce(new Error("OAuth setSession failed"))
      .mockResolvedValueOnce(undefined);

    await expect(runAuthOAuthBootstrap(client, consume)).rejects.toThrow("OAuth setSession failed");
    await expect(runAuthOAuthBootstrap(client, consume)).resolves.toBeUndefined();

    expect(consume).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAuthSignOutOperation,
  SIGN_OUT_RECOVERY_DELAY_MS,
} from "@/lib/authSignOutOperationService";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("auth client sign-out operation ownership", () => {
  it("returns one idle operation service for each actual auth client", () => {
    const client = {};
    const service = getAuthSignOutOperation(client);
    expect(service.getSnapshot()).toBe("idle");
    expect(getAuthSignOutOperation(client)).toBe(service);
    expect(getAuthSignOutOperation({})).not.toBe(service);
  });

  it("keeps distinct auth clients independent while an exit is pending", () => {
    const first = getAuthSignOutOperation({});
    const second = getAuthSignOutOperation({});
    const firstLease = first.begin();
    expect(firstLease).not.toBeNull();
    expect(first.getSnapshot()).toBe("pending");
    expect(second.getSnapshot()).toBe("idle");
    const secondLease = second.begin();
    expect(secondLease).not.toBeNull();
    firstLease!.finish();
    expect(first.getSnapshot()).toBe("idle");
    expect(second.getSnapshot()).toBe("pending");
    secondLease!.finish();
    expect(second.getSnapshot()).toBe("idle");
  });

  it("rejects duplicate exits and publishes one transition per ownership change", () => {
    const service = getAuthSignOutOperation({});
    const snapshots: string[] = [];
    const unsubscribe = service.subscribe(() => snapshots.push(service.getSnapshot()));
    const lease = service.begin();
    expect(lease).not.toBeNull();
    expect(service.begin()).toBeNull();
    expect(snapshots).toEqual(["pending"]);
    lease!.finish();
    lease!.finish();
    expect(snapshots).toEqual(["pending", "idle"]);
    unsubscribe();
  });

  it("preserves the lock when a provider unsubscribes and a new provider uses the same client", () => {
    const client = {};
    const firstProvider = getAuthSignOutOperation(client);
    const oldListener = vi.fn();
    const unmount = firstProvider.subscribe(oldListener);
    const lease = firstProvider.begin();
    expect(lease).not.toBeNull();
    unmount();
    oldListener.mockClear();

    const remountedProvider = getAuthSignOutOperation(client);
    const nextSnapshots: string[] = [];
    const unsubscribe = remountedProvider.subscribe(() =>
      nextSnapshots.push(remountedProvider.getSnapshot()),
    );
    expect(remountedProvider.getSnapshot()).toBe("pending");
    expect(remountedProvider.begin()).toBeNull();
    lease!.finish();
    expect(nextSnapshots).toEqual(["idle"]);
    expect(oldListener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("offers stalled recovery after fifteen seconds without releasing the active SDK operation", () => {
    expect(SIGN_OUT_RECOVERY_DELAY_MS).toBe(15_000);
    const service = getAuthSignOutOperation({});
    const snapshots: string[] = [];
    const unsubscribe = service.subscribe(() => snapshots.push(service.getSnapshot()));
    const lease = service.begin();
    expect(lease).not.toBeNull();
    vi.advanceTimersByTime(SIGN_OUT_RECOVERY_DELAY_MS - 1);
    expect(service.getSnapshot()).toBe("pending");
    vi.advanceTimersByTime(1);
    expect(service.getSnapshot()).toBe("stalled");
    expect(service.begin()).toBeNull();
    vi.advanceTimersByTime(SIGN_OUT_RECOVERY_DELAY_MS * 4);
    expect(service.getSnapshot()).toBe("stalled");
    expect(snapshots).toEqual(["pending", "stalled"]);
    lease!.finish();
    expect(service.getSnapshot()).toBe("idle");
    expect(snapshots).toEqual(["pending", "stalled", "idle"]);
    unsubscribe();
  });

  it("does not publish a late stalled state after an operation finishes", () => {
    const service = getAuthSignOutOperation({});
    const snapshots: string[] = [];
    const unsubscribe = service.subscribe(() => snapshots.push(service.getSnapshot()));
    const lease = service.begin();
    expect(lease).not.toBeNull();
    vi.advanceTimersByTime(100);
    lease!.finish();
    vi.advanceTimersByTime(SIGN_OUT_RECOVERY_DELAY_MS * 2);
    expect(service.getSnapshot()).toBe("idle");
    expect(snapshots).toEqual(["pending", "idle"]);
    unsubscribe();
  });

  it("does not let an old completion release or stall a newer operation", () => {
    const service = getAuthSignOutOperation({});
    const first = service.begin();
    expect(first).not.toBeNull();
    vi.advanceTimersByTime(SIGN_OUT_RECOVERY_DELAY_MS - 1);
    first!.finish();
    const second = service.begin();
    expect(second).not.toBeNull();
    first!.finish();
    vi.advanceTimersByTime(1);
    expect(service.getSnapshot()).toBe("pending");
    expect(service.begin()).toBeNull();
    vi.advanceTimersByTime(SIGN_OUT_RECOVERY_DELAY_MS - 1);
    expect(service.getSnapshot()).toBe("stalled");
    first!.finish();
    expect(service.getSnapshot()).toBe("stalled");
    second!.finish();
    expect(service.getSnapshot()).toBe("idle");
  });

  it("lets one subscriber leave without interrupting another or dropping the lock", () => {
    const service = getAuthSignOutOperation({});
    const first = vi.fn();
    const secondSnapshots: string[] = [];
    const unsubscribeFirst = service.subscribe(first);
    const unsubscribeSecond = service.subscribe(() => secondSnapshots.push(service.getSnapshot()));
    const lease = service.begin();
    expect(lease).not.toBeNull();
    expect(first).toHaveBeenCalledTimes(1);
    unsubscribeFirst();
    unsubscribeFirst();
    vi.advanceTimersByTime(SIGN_OUT_RECOVERY_DELAY_MS);
    expect(first).toHaveBeenCalledTimes(1);
    expect(secondSnapshots).toEqual(["pending", "stalled"]);
    expect(service.begin()).toBeNull();
    lease!.finish();
    expect(secondSnapshots).toEqual(["pending", "stalled", "idle"]);
    unsubscribeSecond();
  });
});

describe("auth client SDK sign-out serialization", () => {
  it("keeps an explicit exit pending behind a held local cleanup until both SDK calls settle", async () => {
    const service = getAuthSignOutOperation({});
    const localGate = deferred<{ error: null }>();
    const explicitGate = deferred<{ error: null }>();
    const localStarted = deferred<void>();
    const explicitStarted = deferred<void>();
    const calls: string[] = [];
    const local = service.runSdkSignOut(() => {
      calls.push("local");
      localStarted.resolve();
      return localGate.promise;
    });
    await localStarted.promise;

    const lease = service.begin();
    expect(lease).not.toBeNull();
    const explicit = service.runSdkSignOut(() => {
      calls.push("explicit");
      explicitStarted.resolve();
      return explicitGate.promise;
    });
    let explicitSettled = false;
    void explicit.then(() => {
      explicitSettled = true;
    });
    await Promise.resolve();
    expect(calls).toEqual(["local"]);
    expect(explicitSettled).toBe(false);
    expect(service.getSnapshot()).toBe("pending");

    localGate.resolve({ error: null });
    expect(await local).toEqual({ error: null });
    await explicitStarted.promise;
    expect(calls).toEqual(["local", "explicit"]);
    expect(explicitSettled).toBe(false);
    expect(service.getSnapshot()).toBe("pending");

    explicitGate.resolve({ error: null });
    expect(await explicit).toEqual({ error: null });
    expect(service.getSnapshot()).toBe("pending");
    // SDK completion alone does not finish the navigation owner's lease.
    lease!.finish();
    expect(service.getSnapshot()).toBe("idle");
  });

  it("propagates a failed predecessor to its caller without poisoning the next SDK call", async () => {
    const service = getAuthSignOutOperation({});
    const predecessorGate = deferred<void>();
    const predecessorStarted = deferred<void>();
    const predecessor = service.runSdkSignOut(() => {
      predecessorStarted.resolve();
      return predecessorGate.promise;
    });
    const rejected = expect(predecessor).rejects.toThrow("fixture SDK failure");
    await predecessorStarted.promise;
    const action = vi.fn(() => ({ error: null }));
    const successor = service.runSdkSignOut(action);
    await Promise.resolve();
    expect(action).not.toHaveBeenCalled();
    predecessorGate.reject(new Error("fixture SDK failure"));
    await rejected;
    expect(await successor).toEqual({ error: null });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("does not block a separate auth client behind another client's pending SDK logout", async () => {
    const first = getAuthSignOutOperation({});
    const second = getAuthSignOutOperation({});
    const gate = deferred<string>();
    const started = deferred<void>();
    const firstCall = first.runSdkSignOut(() => {
      started.resolve();
      return gate.promise;
    });
    let firstSettled = false;
    void firstCall.then(() => {
      firstSettled = true;
    });
    await started.promise;
    expect(await second.runSdkSignOut(() => "second client completed")).toBe(
      "second client completed",
    );
    expect(firstSettled).toBe(false);
    gate.resolve("first client completed");
    expect(await firstCall).toBe("first client completed");
  });
});

/**
 * Account-backed home view — service behaviour against a fake auth client.
 *
 * Covers the account read (explicit value, confirmed absence, failure, timeout,
 * deduplication, foreign identity), the account write (confirmed read-back,
 * unconfirmed read-back, thrown error) and the device cache they maintain.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureUiViewPreferenceLoaded,
  forgetUiViewPreferenceState,
  getUiViewPreferenceGeneration,
  getUiViewPreferenceVersion,
  getUiViewSnapshot,
  resetUiViewPreferenceStoreForTest,
  resolveUiViewAuthClient,
  retryUiViewPreferenceRead,
  saveUiViewPreference,
  subscribeUiViewPreference,
  type UiViewAuthClient,
} from "@/lib/uiViewPreferenceService";
import { UI_VIEW_METADATA_KEY, UI_VIEW_METADATA_SET_AT_KEY } from "@/lib/uiViewPreferenceRules";

const USER = "user-aaa";
const CACHE_KEY = `verdant:uiView:${USER}`;

function fakeClient(overrides: Partial<UiViewAuthClient> = {}): UiViewAuthClient & {
  getUser: ReturnType<typeof vi.fn>;
  updateUser: ReturnType<typeof vi.fn>;
} {
  const getUser = vi.fn(async () => ({
    data: { user: { id: USER, user_metadata: {} } },
    error: null,
  }));
  const updateUser = vi.fn(async (attrs: { data: Record<string, unknown> }) => ({
    data: { user: { id: USER, user_metadata: { ...attrs.data } } },
    error: null,
  }));
  return { getUser, updateUser, ...overrides } as never;
}

beforeEach(() => {
  resetUiViewPreferenceStoreForTest();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveUiViewAuthClient", () => {
  it("returns null for a client without the auth surface (page tests mock only `from`)", () => {
    expect(resolveUiViewAuthClient({ from: () => ({}) })).toBeNull();
    expect(resolveUiViewAuthClient(null)).toBeNull();
    expect(resolveUiViewAuthClient({ auth: { getUser: () => {} } })).toBeNull();
  });

  it("returns the auth surface when both calls exist", () => {
    const client = fakeClient();
    expect(resolveUiViewAuthClient({ auth: client })).toBe(client);
  });
});

describe("account read", () => {
  it("signed out reads as the default, ready, and never explicit", () => {
    expect(getUiViewSnapshot(null, undefined)).toMatchObject({
      view: "simple",
      explicit: false,
      status: "ready",
    });
  });

  it("is loading until the account answers when nothing explicit is known on this device", async () => {
    let release: (v: unknown) => void = () => {};
    const client = fakeClient({
      getUser: vi.fn(() => new Promise((resolve) => (release = resolve))) as never,
    });
    const read = ensureUiViewPreferenceLoaded(client, USER);
    expect(getUiViewSnapshot(USER, {}).status).toBe("loading");
    release({
      data: { user: { id: USER, user_metadata: { [UI_VIEW_METADATA_KEY]: "advanced" } } },
      error: null,
    });
    await read;
    expect(getUiViewSnapshot(USER, {})).toMatchObject({
      view: "advanced",
      source: "account",
      explicit: true,
      status: "ready",
    });
    expect(window.localStorage.getItem(CACHE_KEY)).toBe("advanced");
  });

  it("a confirmed absence on the account is Simple by default and clears a stale cache", async () => {
    window.localStorage.setItem(CACHE_KEY, "advanced");
    const client = fakeClient();
    await ensureUiViewPreferenceLoaded(client, USER);
    expect(getUiViewSnapshot(USER, {})).toMatchObject({
      view: "simple",
      source: "default",
      explicit: false,
      status: "ready",
    });
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("the session's own metadata renders immediately while the account read is pending", () => {
    const client = fakeClient({ getUser: vi.fn(() => new Promise(() => {})) as never });
    void ensureUiViewPreferenceLoaded(client, USER);
    expect(getUiViewSnapshot(USER, { [UI_VIEW_METADATA_KEY]: "advanced" })).toMatchObject({
      view: "advanced",
      source: "session",
      status: "ready",
    });
  });

  it("a failed read keeps the device cache and reports unavailable, never a reset", async () => {
    window.localStorage.setItem(CACHE_KEY, "advanced");
    const client = fakeClient({
      getUser: vi.fn(async () => ({ data: { user: null }, error: new Error("network") })) as never,
    });
    await ensureUiViewPreferenceLoaded(client, USER);
    expect(getUiViewSnapshot(USER, {})).toMatchObject({
      view: "advanced",
      source: "cache",
      explicit: true,
      status: "unavailable",
    });
    expect(window.localStorage.getItem(CACHE_KEY)).toBe("advanced");
  });

  it("a failed read with no cache shows the default as unavailable, not as a saved choice", async () => {
    const client = fakeClient({
      getUser: vi.fn(async () => {
        throw new Error("boom");
      }) as never,
    });
    await ensureUiViewPreferenceLoaded(client, USER);
    expect(getUiViewSnapshot(USER, {})).toMatchObject({
      view: "simple",
      source: "default",
      explicit: false,
      status: "unavailable",
    });
  });

  it("a read that never settles is bounded and reports unavailable", async () => {
    vi.useFakeTimers();
    const client = fakeClient({ getUser: vi.fn(() => new Promise(() => {})) as never });
    const read = ensureUiViewPreferenceLoaded(client, USER, { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(60);
    await read;
    expect(getUiViewSnapshot(USER, {}).status).toBe("unavailable");
  });

  it("a missing auth client is unavailable without throwing", async () => {
    await ensureUiViewPreferenceLoaded(null, USER);
    expect(getUiViewSnapshot(USER, {}).status).toBe("unavailable");
  });

  it("deduplicates concurrent reads and does not re-read a settled account", async () => {
    const client = fakeClient();
    await Promise.all([
      ensureUiViewPreferenceLoaded(client, USER),
      ensureUiViewPreferenceLoaded(client, USER),
    ]);
    await ensureUiViewPreferenceLoaded(client, USER);
    expect(client.getUser).toHaveBeenCalledTimes(1);
  });

  it("drops an answer that belongs to a different identity", async () => {
    const client = fakeClient({
      getUser: vi.fn(async () => ({
        data: {
          user: { id: "someone-else", user_metadata: { [UI_VIEW_METADATA_KEY]: "advanced" } },
        },
        error: null,
      })) as never,
    });
    await ensureUiViewPreferenceLoaded(client, USER);
    expect(getUiViewSnapshot(USER, {})).toMatchObject({ view: "simple", status: "unavailable" });
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("retry re-runs a failed read", async () => {
    const getUser = vi
      .fn()
      .mockResolvedValueOnce({ data: { user: null }, error: new Error("offline") })
      .mockResolvedValueOnce({
        data: { user: { id: USER, user_metadata: { [UI_VIEW_METADATA_KEY]: "advanced" } } },
        error: null,
      });
    const client = fakeClient({ getUser: getUser as never });
    await ensureUiViewPreferenceLoaded(client, USER);
    expect(getUiViewSnapshot(USER, {}).status).toBe("unavailable");
    await retryUiViewPreferenceRead(client, USER);
    expect(getUiViewSnapshot(USER, {})).toMatchObject({ view: "advanced", status: "ready" });
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});

describe("account write", () => {
  it("writes the namespaced keys, confirms by read-back, and updates the cache", async () => {
    const client = fakeClient();
    await ensureUiViewPreferenceLoaded(client, USER);
    const ok = await saveUiViewPreference(
      client,
      USER,
      "advanced",
      () => "2026-10-29T00:00:00.000Z",
    );
    expect(ok).toBe(true);
    expect(client.updateUser).toHaveBeenCalledWith({
      data: {
        [UI_VIEW_METADATA_KEY]: "advanced",
        [UI_VIEW_METADATA_SET_AT_KEY]: "2026-10-29T00:00:00.000Z",
      },
    });
    expect(getUiViewSnapshot(USER, {})).toMatchObject({
      view: "advanced",
      source: "account",
      explicit: true,
      save: { kind: "saved", view: "advanced" },
    });
    expect(window.localStorage.getItem(CACHE_KEY)).toBe("advanced");
  });

  it("holds the chosen view for this session but reports failure when the write throws", async () => {
    const client = fakeClient({
      updateUser: vi.fn(async () => {
        throw new Error("offline");
      }) as never,
    });
    await ensureUiViewPreferenceLoaded(client, USER);
    const ok = await saveUiViewPreference(client, USER, "advanced");
    expect(ok).toBe(false);
    const snapshot = getUiViewSnapshot(USER, {});
    expect(snapshot.view).toBe("advanced");
    expect(snapshot.save).toEqual({ kind: "failed", view: "advanced", message: "write_failed" });
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("treats a read-back that lacks the new value as unconfirmed, not saved", async () => {
    const client = fakeClient({
      updateUser: vi.fn(async () => ({
        data: { user: { id: USER, user_metadata: {} } },
        error: null,
      })) as never,
    });
    await ensureUiViewPreferenceLoaded(client, USER);
    const ok = await saveUiViewPreference(client, USER, "advanced");
    expect(ok).toBe(false);
    expect(getUiViewSnapshot(USER, {}).save).toEqual({
      kind: "failed",
      view: "advanced",
      message: "unconfirmed",
    });
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("rejects an unknown view without touching the account", async () => {
    const client = fakeClient();
    const ok = await saveUiViewPreference(client, USER, "basic" as never);
    expect(ok).toBe(false);
    expect(client.updateUser).not.toHaveBeenCalled();
  });

  it("fails calmly without an auth client", async () => {
    const ok = await saveUiViewPreference(null, USER, "simple");
    expect(ok).toBe(false);
    expect(getUiViewSnapshot(USER, {}).save).toMatchObject({ kind: "failed" });
  });

  it("notifies subscribers and bumps the version on every state change", async () => {
    const client = fakeClient();
    const listener = vi.fn();
    const unsubscribe = subscribeUiViewPreference(listener);
    const before = getUiViewPreferenceVersion();
    await ensureUiViewPreferenceLoaded(client, USER);
    await saveUiViewPreference(client, USER, "advanced");
    expect(listener).toHaveBeenCalled();
    expect(getUiViewPreferenceVersion()).toBeGreaterThan(before);
    unsubscribe();
  });

  it("an earlier save that completes later cannot clear a newer pending choice", async () => {
    const releases: Array<(v: unknown) => void> = [];
    const client = fakeClient({
      updateUser: vi.fn(() => new Promise((resolve) => releases.push(resolve))) as never,
    });
    await ensureUiViewPreferenceLoaded(client, USER);
    const first = saveUiViewPreference(client, USER, "advanced");
    const second = saveUiViewPreference(client, USER, "simple");
    expect(getUiViewSnapshot(USER, {})).toMatchObject({
      view: "simple",
      save: { kind: "saving", view: "simple" },
    });
    // First write succeeds after the second was requested.
    releases[0]({
      data: { user: { id: USER, user_metadata: { [UI_VIEW_METADATA_KEY]: "advanced" } } },
      error: null,
    });
    expect(await first).toBe(true);
    expect(getUiViewSnapshot(USER, {})).toMatchObject({
      view: "simple",
      save: { kind: "saving", view: "simple" },
    });
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
    // Second write fails: the grower keeps the view they chose, and is told it was not saved.
    releases[1]({ data: { user: null }, error: new Error("offline") });
    expect(await second).toBe(false);
    expect(getUiViewSnapshot(USER, {})).toMatchObject({
      view: "simple",
      save: { kind: "failed", view: "simple", message: "unconfirmed" },
    });
  });

  it("forgetting on sign-out keeps the device cache and makes the next read hit the account", async () => {
    const client = fakeClient();
    await ensureUiViewPreferenceLoaded(client, USER);
    await saveUiViewPreference(client, USER, "advanced");
    const generation = getUiViewPreferenceGeneration();
    forgetUiViewPreferenceState();
    expect(getUiViewPreferenceGeneration()).toBe(generation + 1);
    expect(window.localStorage.getItem(CACHE_KEY)).toBe("advanced");
    // The device cache is the honest fallback (ready, not loading) while the account is read again.
    expect(getUiViewSnapshot(USER, {})).toMatchObject({ view: "advanced", status: "ready" });
    client.getUser.mockResolvedValueOnce({
      data: { user: { id: USER, user_metadata: { [UI_VIEW_METADATA_KEY]: "simple" } } },
      error: null,
    });
    await ensureUiViewPreferenceLoaded(client, USER);
    expect(client.getUser).toHaveBeenCalledTimes(2);
    expect(getUiViewSnapshot(USER, {})).toMatchObject({ view: "simple", status: "ready" });
    expect(window.localStorage.getItem(CACHE_KEY)).toBe("simple");
  });

  it("keeps two users' states apart", async () => {
    const client = fakeClient();
    await saveUiViewPreference(client, USER, "advanced");
    expect(getUiViewSnapshot("user-bbb", {})).toMatchObject({ view: "simple", explicit: false });
  });
});

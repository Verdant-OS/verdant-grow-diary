/**
 * Account-backed tips setting and tip state (Simple View Phase 3) against a
 * fake auth client: one read per user, honest loading/unavailable status, a
 * write confirmed by read-back, sequenced saves, sign-out forgetting.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureGuidanceLoaded,
  forgetGuidanceState,
  getGuidanceSnapshot,
  retryGuidanceRead,
  saveGuidanceState,
} from "@/lib/guidancePreferenceService";
import {
  DEFAULT_GUIDANCE_STATE,
  GUIDANCE_METADATA_KEY,
  type GuidanceState,
} from "@/lib/simpleHomeGuidanceRules";
import type { UiViewAuthClient } from "@/lib/uiViewPreferenceService";

const USER = "user-aaa";
const NOW = "2026-10-29T12:00:00.000Z";
const DISMISSED: GuidanceState = {
  tips: "on",
  notices: { "first-observation": { dismissCount: 1, dismissedAt: NOW, snoozedUntil: null } },
};

function fakeClient(metadata: Record<string, unknown> = {}) {
  const getUser = vi.fn(async () => ({
    data: { user: { id: USER, user_metadata: metadata } },
    error: null as unknown,
  }));
  const updateUser = vi.fn(async (attrs: { data: Record<string, unknown> }) => ({
    data: { user: { id: USER, user_metadata: { ...metadata, ...attrs.data } } },
    error: null as unknown,
  }));
  return { getUser, updateUser } as unknown as UiViewAuthClient & {
    getUser: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  forgetGuidanceState();
});

describe("read", () => {
  it("is loading until the account answers, then ready with the stored state", async () => {
    expect(getGuidanceSnapshot(USER).status).toBe("loading");
    const client = fakeClient({
      [GUIDANCE_METADATA_KEY]: { v: 1, tips: "off", notices: DISMISSED.notices },
    });
    await ensureGuidanceLoaded(client, USER);
    expect(getGuidanceSnapshot(USER)).toMatchObject({
      status: "ready",
      state: { tips: "off", notices: DISMISSED.notices },
    });
  });

  it("an account with no stored value is ready with the defaults", async () => {
    await ensureGuidanceLoaded(fakeClient(), USER);
    expect(getGuidanceSnapshot(USER)).toMatchObject({
      status: "ready",
      state: DEFAULT_GUIDANCE_STATE,
    });
  });

  it("reads once per user even when asked repeatedly", async () => {
    const client = fakeClient();
    await Promise.all([ensureGuidanceLoaded(client, USER), ensureGuidanceLoaded(client, USER)]);
    await ensureGuidanceLoaded(client, USER);
    expect(client.getUser).toHaveBeenCalledTimes(1);
  });

  it("a failed read, a foreign identity or a missing client is unavailable, not defaults", async () => {
    const failing = fakeClient();
    failing.getUser.mockResolvedValueOnce({ data: null, error: new Error("offline") } as never);
    await ensureGuidanceLoaded(failing, USER);
    expect(getGuidanceSnapshot(USER).status).toBe("unavailable");

    forgetGuidanceState();
    const foreign = fakeClient();
    foreign.getUser.mockResolvedValueOnce({
      data: { user: { id: "someone-else", user_metadata: {} } },
      error: null,
    } as never);
    await ensureGuidanceLoaded(foreign, USER);
    expect(getGuidanceSnapshot(USER).status).toBe("unavailable");

    forgetGuidanceState();
    await ensureGuidanceLoaded(null, USER);
    expect(getGuidanceSnapshot(USER).status).toBe("unavailable");
  });

  it("retry reads again", async () => {
    const client = fakeClient();
    client.getUser.mockRejectedValueOnce(new Error("offline"));
    await ensureGuidanceLoaded(client, USER);
    expect(getGuidanceSnapshot(USER).status).toBe("unavailable");
    await retryGuidanceRead(client, USER);
    expect(getGuidanceSnapshot(USER).status).toBe("ready");
  });

  it("signed out is unavailable with defaults", () => {
    expect(getGuidanceSnapshot(null)).toMatchObject({
      status: "unavailable",
      state: DEFAULT_GUIDANCE_STATE,
    });
  });
});

describe("write", () => {
  it("writes only the namespaced key and succeeds on a matching read-back", async () => {
    const client = fakeClient({ verdant_ui_view: "advanced" });
    await ensureGuidanceLoaded(client, USER);
    await expect(saveGuidanceState(client, USER, DISMISSED)).resolves.toBe(true);
    expect(client.updateUser).toHaveBeenCalledWith({
      data: { [GUIDANCE_METADATA_KEY]: { v: 1, tips: "on", notices: DISMISSED.notices } },
    });
    expect(getGuidanceSnapshot(USER)).toMatchObject({
      status: "ready",
      state: DISMISSED,
      save: { kind: "saved" },
    });
  });

  it("an unconfirmed or failed write is reported and the change is held for this session", async () => {
    const client = fakeClient();
    await ensureGuidanceLoaded(client, USER);
    client.updateUser.mockResolvedValueOnce({
      data: { user: { id: USER, user_metadata: {} } },
      error: null,
    } as never);
    await expect(saveGuidanceState(client, USER, DISMISSED)).resolves.toBe(false);
    expect(getGuidanceSnapshot(USER)).toMatchObject({ state: DISMISSED, save: { kind: "failed" } });

    client.updateUser.mockRejectedValueOnce(new Error("offline"));
    await expect(saveGuidanceState(client, USER, DEFAULT_GUIDANCE_STATE)).resolves.toBe(false);
    expect(getGuidanceSnapshot(USER)).toMatchObject({
      state: DEFAULT_GUIDANCE_STATE,
      save: { kind: "failed" },
    });
  });

  it("only the latest save settles: a slow earlier write cannot undo a newer one", async () => {
    const client = fakeClient();
    await ensureGuidanceLoaded(client, USER);
    let releaseFirst: () => void = () => {};
    client.updateUser.mockImplementationOnce(
      (attrs: { data: Record<string, unknown> }) =>
        new Promise((resolve) => {
          releaseFirst = () =>
            resolve({ data: { user: { id: USER, user_metadata: attrs.data } }, error: null });
        }),
    );
    const first = saveGuidanceState(client, USER, DISMISSED);
    const offState: GuidanceState = { tips: "off", notices: {} };
    await saveGuidanceState(client, USER, offState);
    releaseFirst();
    await first;
    expect(getGuidanceSnapshot(USER)).toMatchObject({ state: offState, save: { kind: "saved" } });
  });

  it("sign-out forgets the session state so the next sign-in reads again", async () => {
    const client = fakeClient();
    await ensureGuidanceLoaded(client, USER);
    await saveGuidanceState(client, USER, DISMISSED);
    forgetGuidanceState();
    expect(getGuidanceSnapshot(USER).status).toBe("loading");
    await ensureGuidanceLoaded(client, USER);
    expect(client.getUser).toHaveBeenCalledTimes(2);
  });
});

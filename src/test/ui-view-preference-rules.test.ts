/**
 * Simple/Advanced home view — pure rules.
 *
 * The default is Simple only when no explicit choice is known; a settled account
 * read outranks the session copy and the device cache; malformed stored values
 * read as "no choice", never as a choice the grower did not make.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_UI_VIEW,
  isUiView,
  readUiViewFromMetadata,
  resolveUiView,
  resolveUiViewReadStatus,
  UI_VIEW_COPY,
  UI_VIEW_METADATA_KEY,
  uiViewCacheKey,
  uiViewSaveStatusCopy,
} from "@/lib/uiViewPreferenceRules";

describe("ui view preference — values", () => {
  it("defaults to Simple", () => {
    expect(DEFAULT_UI_VIEW).toBe("simple");
  });

  it("accepts only the two known views", () => {
    expect(isUiView("simple")).toBe(true);
    expect(isUiView("advanced")).toBe(true);
    for (const bad of ["Simple", "ADVANCED", "", null, undefined, 0, {}, [], "basic"]) {
      expect(isUiView(bad)).toBe(false);
    }
  });

  it("reads the namespaced metadata key and ignores everything else", () => {
    expect(readUiViewFromMetadata({ [UI_VIEW_METADATA_KEY]: "advanced" })).toBe("advanced");
    expect(readUiViewFromMetadata({ [UI_VIEW_METADATA_KEY]: "simple" })).toBe("simple");
    expect(readUiViewFromMetadata({ [UI_VIEW_METADATA_KEY]: "garbage" })).toBeNull();
    expect(readUiViewFromMetadata({ view: "advanced" })).toBeNull();
    expect(readUiViewFromMetadata(null)).toBeNull();
    expect(readUiViewFromMetadata(undefined)).toBeNull();
    expect(readUiViewFromMetadata("advanced")).toBeNull();
    expect(readUiViewFromMetadata(["advanced"])).toBeNull();
  });

  it("scopes the device cache key to a validated user id", () => {
    expect(uiViewCacheKey("user-1")).toBe("verdant:uiView:user-1");
    expect(uiViewCacheKey("")).toBeNull();
    expect(uiViewCacheKey("has space")).toBeNull();
    expect(uiViewCacheKey("a".repeat(129))).toBeNull();
  });
});

describe("ui view preference — resolution precedence", () => {
  it("a settled account value wins over session and cache", () => {
    expect(
      resolveUiView({
        account: "advanced",
        session: "simple",
        cache: "simple",
        accountUnavailable: false,
      }),
    ).toEqual({ view: "advanced", source: "account", explicit: true });
  });

  it("a confirmed absence on the account is the default and is not explicit", () => {
    expect(
      resolveUiView({
        account: null,
        session: "advanced",
        cache: "advanced",
        accountUnavailable: false,
      }),
    ).toEqual({ view: "simple", source: "default", explicit: false });
  });

  it("falls back to the session copy, then the cache, while the account is unread", () => {
    expect(
      resolveUiView({
        account: undefined,
        session: "advanced",
        cache: "simple",
        accountUnavailable: false,
      }),
    ).toEqual({ view: "advanced", source: "session", explicit: true });
    expect(
      resolveUiView({
        account: undefined,
        session: null,
        cache: "advanced",
        accountUnavailable: false,
      }),
    ).toEqual({ view: "advanced", source: "cache", explicit: true });
    expect(
      resolveUiView({ account: undefined, session: null, cache: null, accountUnavailable: false }),
    ).toEqual({ view: "simple", source: "default", explicit: false });
  });

  it("an unavailable account never resets an explicit device value to the default", () => {
    expect(
      resolveUiView({
        account: undefined,
        session: null,
        cache: "advanced",
        accountUnavailable: true,
      }),
    ).toEqual({ view: "advanced", source: "cache", explicit: true });
  });

  it("is deterministic", () => {
    const input = {
      account: undefined,
      session: null,
      cache: "advanced",
      accountUnavailable: false,
    } as const;
    expect(resolveUiView(input)).toEqual(resolveUiView(input));
  });
});

describe("ui view preference — read status", () => {
  it("is loading only when nothing explicit is known and the account is unread", () => {
    expect(
      resolveUiViewReadStatus({
        account: undefined,
        session: null,
        cache: null,
        accountUnavailable: false,
      }),
    ).toBe("loading");
  });

  it("is ready when the session or cache carries a choice, or the account settled", () => {
    expect(
      resolveUiViewReadStatus({
        account: undefined,
        session: "simple",
        cache: null,
        accountUnavailable: false,
      }),
    ).toBe("ready");
    expect(
      resolveUiViewReadStatus({
        account: undefined,
        session: null,
        cache: "advanced",
        accountUnavailable: false,
      }),
    ).toBe("ready");
    expect(
      resolveUiViewReadStatus({
        account: null,
        session: null,
        cache: null,
        accountUnavailable: false,
      }),
    ).toBe("ready");
  });

  it("is unavailable when the account read failed", () => {
    expect(
      resolveUiViewReadStatus({
        account: undefined,
        session: null,
        cache: null,
        accountUnavailable: true,
      }),
    ).toBe("unavailable");
  });
});

describe("ui view preference — copy", () => {
  it("names the real save outcome and never claims a save on failure", () => {
    expect(uiViewSaveStatusCopy({ kind: "idle" })).toBeNull();
    expect(uiViewSaveStatusCopy({ kind: "saving", view: "advanced" })).toBe(UI_VIEW_COPY.saving);
    expect(uiViewSaveStatusCopy({ kind: "saved", view: "advanced" })).toBe(
      UI_VIEW_COPY.savedToAccount,
    );
    expect(uiViewSaveStatusCopy({ kind: "failed", view: "advanced", message: "x" })).toBe(
      UI_VIEW_COPY.saveFailed,
    );
    expect(UI_VIEW_COPY.saveFailed).toMatch(/Couldn't save/);
    expect(UI_VIEW_COPY.saveFailed).not.toMatch(/saved to your account/i);
  });
});

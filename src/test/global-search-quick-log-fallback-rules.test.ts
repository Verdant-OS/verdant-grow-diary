/**
 * Pins the Global Search context-free Quick Log fallback.
 *
 * Regression origin: a signed-in grower who opened Global Search from a route
 * with no plant/tent (e.g. the dashboard) and picked a Quick Log preset was
 * navigated to the public /quick-log starter. That surface writes only a
 * device-local draft — never their diary — and its only call to action is
 * "Create a free account", which is nonsense for someone already signed in
 * and leaves no route back to the dashboard.
 *
 * The load-bearing part of the fix is the ARGUMENT: the rule must be called
 * with the real session. An earlier version of this file asserted only that
 * the rule was called at all, which mutation testing showed was useless —
 * rewriting `isSignedIn: !!user` to `isSignedIn: false` restored the bug with
 * every test still green. The scans below pin the argument itself.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  resolveContextFreeQuickLogDestination,
  readQuickLogStartEventType,
  QUICK_LOG_START_TYPE_PARAM,
  type ContextFreeQuickLogInput,
} from "@/lib/globalSearchQuickLogFallbackRules";
import { QUICK_LOG_START_ROUTE, consumeQuickLogStartIntent } from "@/lib/startScreenPreferences";
import { PUBLIC_QUICK_LOG_STARTER_PATH } from "@/lib/quickLogStarterLinks";
import {
  PUBLIC_QUICK_LOG_STARTER_LOG_TYPES,
  type PublicQuickLogStarterLogType,
} from "@/lib/publicQuickLogStarterRules";

const resolve = (input: ContextFreeQuickLogInput) => resolveContextFreeQuickLogDestination(input);

/** Read a repo source file, failing loudly rather than silently passing. */
function readSource(rel: string): string {
  const body = readFileSync(resolvePath(process.cwd(), rel), "utf8");
  // Guards against a moved/renamed file quietly turning every scan into a
  // vacuous pass on an empty string.
  expect(body.length, `${rel} should not be empty`).toBeGreaterThan(500);
  return body;
}

describe("Global Search context-free Quick Log fallback", () => {
  it("never sends a signed-in grower to the public starter", () => {
    const seeds: Array<PublicQuickLogStarterLogType | null> = [
      null,
      ...PUBLIC_QUICK_LOG_STARTER_LOG_TYPES,
    ];
    for (const fallbackType of seeds) {
      const dest = resolve({ isSignedIn: true, fallbackType });
      expect(dest.kind).toBe("authed-start");
      // The literal regression: no signed-in path may reach /quick-log.
      expect(dest.to.startsWith(QUICK_LOG_START_ROUTE)).toBe(true);
      expect(dest.to).not.toContain(PUBLIC_QUICK_LOG_STARTER_PATH);
    }
  });

  it("routes signed-in growers through the dashboard open=quick-log intent", () => {
    expect(resolve({ isSignedIn: true, fallbackType: null }).to).toBe("/dashboard?open=quick-log");
  });

  it("keeps the public starter for anonymous visitors, with no seed", () => {
    const dest = resolve({ isSignedIn: false, fallbackType: null });
    expect(dest.kind).toBe("public-starter");
    expect(dest.to).toBe(PUBLIC_QUICK_LOG_STARTER_PATH);
  });

  it("carries the ?type= seed for anonymous visitors", () => {
    for (const seed of PUBLIC_QUICK_LOG_STARTER_LOG_TYPES) {
      const dest = resolve({ isSignedIn: false, fallbackType: seed });
      expect(dest.kind).toBe("public-starter");
      expect(dest.to).toBe(`${PUBLIC_QUICK_LOG_STARTER_PATH}?type=${seed}`);
    }
  });

  it("ignores an unrecognised seed instead of forwarding it", () => {
    // Defence in depth: a value outside the closed vocabulary must not reach
    // a URL, where it would silently no-op on the starter or the selector.
    const dest = resolve({
      isSignedIn: false,
      fallbackType: "not-a-real-type" as PublicQuickLogStarterLogType,
    });
    expect(dest.to).toBe(PUBLIC_QUICK_LOG_STARTER_PATH);
  });

  it("is pure — repeated calls agree", () => {
    const input: ContextFreeQuickLogInput = { isSignedIn: false, fallbackType: "feeding" };
    expect(resolve(input)).toEqual(resolve(input));
  });
});

describe("preset survives the authed hand-off", () => {
  it("carries the chosen preset on the authed intent URL", () => {
    for (const seed of PUBLIC_QUICK_LOG_STARTER_LOG_TYPES) {
      const to = resolve({ isSignedIn: true, fallbackType: seed }).to;
      expect(to).toBe(`${QUICK_LOG_START_ROUTE}&${QUICK_LOG_START_TYPE_PARAM}=${seed}`);
      // Round-trips: what the builder writes, the reader reads back.
      expect(readQuickLogStartEventType(to.slice(to.indexOf("?")))).toBe(seed);
    }
  });

  it("reads nothing back when there is no preset", () => {
    const to = resolve({ isSignedIn: true, fallbackType: null }).to;
    expect(readQuickLogStartEventType(to.slice(to.indexOf("?")))).toBeNull();
  });

  it("refuses a type that is not part of a real quick-log intent", () => {
    // A bare ?type= belongs to some other feature; never seed from it.
    expect(readQuickLogStartEventType("?type=watering")).toBeNull();
    expect(readQuickLogStartEventType("")).toBeNull();
    expect(readQuickLogStartEventType(null)).toBeNull();
  });

  it("refuses a hand-edited type outside the vocabulary", () => {
    expect(readQuickLogStartEventType("?open=quick-log&type=rm-rf")).toBeNull();
    expect(readQuickLogStartEventType("?open=quick-log&type=")).toBeNull();
  });

  it("consuming the intent strips the preset so it cannot re-seed on refresh", () => {
    const next = consumeQuickLogStartIntent("?open=quick-log&type=watering");
    expect(next).toBe("");
    expect(readQuickLogStartEventType(next ?? "")).toBeNull();
  });

  it("consuming preserves unrelated params but drops only its own marker", () => {
    expect(consumeQuickLogStartIntent("?open=quick-log&type=feeding&growId=abc")).toBe(
      "?growId=abc",
    );
  });

  it("leaves a bare ?type= alone when there is no intent to consume", () => {
    // No open=quick-log means the marker is not ours to remove.
    expect(consumeQuickLogStartIntent("?type=watering")).toBeNull();
  });
});

describe("GlobalSearchDialog wiring", () => {
  const body = () => readSource("src/components/GlobalSearchDialog.tsx");

  it("passes the REAL session into the rule, not a constant", () => {
    // This is the assertion that mutation testing showed was missing. A
    // rewrite to `isSignedIn: false` / `!user` must fail here.
    expect(body()).toMatch(/resolveContextFreeQuickLogDestination\(\{\s*isSignedIn:\s*!!user\s*,/);
  });

  it("sources the session from the auth store", () => {
    const src = body();
    expect(src).toContain('from "@/store/auth"');
    expect(src).toMatch(/const\s*\{\s*user\s*\}\s*=\s*useAuth\(\)/);
  });

  it("resolves the fallback through the rule instead of hardcoding /quick-log", () => {
    const src = body();
    expect(src).toContain("resolveContextFreeQuickLogDestination");
    // The old unconditional navigation must not come back.
    expect(src).not.toMatch(/navigate\(\s*fallbackType\s*\?/);
    expect(src).not.toMatch(/navigate\(\s*["'`]\/quick-log/);
  });
});

describe("AppShell intent consumption wiring", () => {
  const body = () => readSource("src/components/AppShell.tsx");

  it("reads the preset before consuming the intent", () => {
    const src = body();
    const readAt = src.indexOf("readQuickLogStartEventType(location.search)");
    const consumeAt = src.indexOf("consumeQuickLogStartIntent(location.search)");
    expect(readAt).toBeGreaterThan(-1);
    expect(consumeAt).toBeGreaterThan(-1);
    // Order matters: consuming strips the marker.
    expect(readAt).toBeLessThan(consumeAt);
  });

  it("seeds the activity from the intent instead of always clearing it", () => {
    // The pre-fix shape was an unconditional setPrefill(null) here, which
    // dropped the grower's chosen preset.
    expect(body()).toMatch(/setPrefill\(\s*startEventType\s*\?\s*\{\s*eventType:\s*startEventType/);
  });
});

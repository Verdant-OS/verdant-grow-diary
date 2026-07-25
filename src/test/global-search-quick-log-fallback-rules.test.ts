/**
 * Pins the Global Search context-free Quick Log fallback.
 *
 * Regression origin: a signed-in grower who opened Global Search from a route
 * with no plant/tent (e.g. the dashboard) and picked a Quick Log preset was
 * navigated to the public /quick-log starter. That surface writes only a
 * device-local draft — never their diary — and its only call to action is
 * "Create a free account", which is nonsense for someone already signed in
 * and leaves no route back to the dashboard.
 */
import { describe, it, expect } from "vitest";
import {
  resolveContextFreeQuickLogDestination,
  type ContextFreeQuickLogInput,
} from "@/lib/globalSearchQuickLogFallbackRules";
import { QUICK_LOG_START_ROUTE } from "@/lib/startScreenPreferences";
import { PUBLIC_QUICK_LOG_STARTER_PATH } from "@/lib/quickLogStarterLinks";
import {
  PUBLIC_QUICK_LOG_STARTER_LOG_TYPES,
  type PublicQuickLogStarterLogType,
} from "@/lib/publicQuickLogStarterRules";

const resolve = (input: ContextFreeQuickLogInput) => resolveContextFreeQuickLogDestination(input);

describe("Global Search context-free Quick Log fallback", () => {
  it("never sends a signed-in grower to the public starter", () => {
    const seeds: Array<PublicQuickLogStarterLogType | null> = [
      null,
      ...PUBLIC_QUICK_LOG_STARTER_LOG_TYPES,
    ];
    for (const fallbackType of seeds) {
      const dest = resolve({ isSignedIn: true, fallbackType });
      expect(dest.kind).toBe("authed-start");
      expect(dest.to).toBe(QUICK_LOG_START_ROUTE);
      // The literal regression: no signed-in path may reach /quick-log.
      expect(dest.to).not.toContain(PUBLIC_QUICK_LOG_STARTER_PATH);
    }
  });

  it("routes signed-in growers through the dashboard open=quick-log intent", () => {
    // AppShell consumes exactly this marker to open the real Quick Log, so the
    // grower lands on their dashboard rather than a signup screen.
    expect(resolve({ isSignedIn: true, fallbackType: "watering" }).to).toBe(
      "/dashboard?open=quick-log",
    );
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

  it("emits only starter-recognised type seeds", () => {
    // A seed the starter does not understand would silently no-op, so the
    // vocabulary here must stay a subset of the starter's closed list.
    for (const seed of PUBLIC_QUICK_LOG_STARTER_LOG_TYPES) {
      const to = resolve({ isSignedIn: false, fallbackType: seed }).to;
      const type = new URLSearchParams(to.split("?")[1] ?? "").get("type");
      expect(PUBLIC_QUICK_LOG_STARTER_LOG_TYPES).toContain(type as PublicQuickLogStarterLogType);
    }
  });

  it("is pure — repeated calls agree", () => {
    const input: ContextFreeQuickLogInput = { isSignedIn: false, fallbackType: "feeding" };
    expect(resolve(input)).toEqual(resolve(input));
  });
});

describe("GlobalSearchDialog wiring", () => {
  it("resolves the fallback through the rule instead of hardcoding /quick-log", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve: resolvePath } = await import("node:path");
    const body = readFileSync(
      resolvePath(process.cwd(), "src/components/GlobalSearchDialog.tsx"),
      "utf8",
    );
    expect(body).toContain("resolveContextFreeQuickLogDestination");
    // The old unconditional navigation must not come back.
    expect(body).not.toMatch(/navigate\(\s*fallbackType\s*\?/);
    expect(body).not.toMatch(/navigate\(\s*["'`]\/quick-log/);
  });
});

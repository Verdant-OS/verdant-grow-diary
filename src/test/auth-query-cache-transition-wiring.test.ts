import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readAllRouteModuleSources } from "./helpers/routeManifestSyncHarness";

const ROOT = resolve(__dirname, "../..");
const APP = readAllRouteModuleSources();
const AUTH = readFileSync(resolve(ROOT, "src/store/auth.tsx"), "utf8").replace(/\r\n?/g, "\n");

describe("auth identity query-cache transition fence", () => {
  it("wires the root QueryClient clear into AuthProvider identity transitions", () => {
    expect(APP).toMatch(
      /function useClearQueryCacheBeforeAuthIdentityChange\(\)[\s\S]{0,400}queryClient\.clear\(\)/,
    );
    expect(APP).toMatch(
      /<AuthProvider\s+onBeforeAuthIdentityChange=\{onBeforeAuthIdentityChange\}>/,
    );
    expect(APP).toMatch(
      /function useClearQueryCacheBeforeAuthIdentityChange\(\)[\s\S]{0,500}clearGrowDataMeta\(\)/,
    );
    expect(APP).toMatch(
      /function useClearQueryCacheBeforeAuthIdentityChange\(\)[\s\S]{0,500}clearGlobalSearchPrivateState\(\)/,
    );
    expect(APP).toMatch(/flushSync\(\(\) => clearGlobalSearchPrivateState\(\)\)/);
    expect(APP).toMatch(
      /const onBeforeAuthIdentityChange = useClearQueryCacheBeforeAuthIdentityChange\(\)/,
    );
  });

  it("runs the synchronous fence before publishing the next session", () => {
    const transitionBody = AUTH.match(
      /const applySession = useCallback\([\s\S]*?\n\s*\);\n\n\s*useEffect/,
    )?.[0];
    expect(transitionBody).toBeTruthy();
    expect(transitionBody?.indexOf("onBeforeAuthIdentityChange?.(")).toBeGreaterThanOrEqual(0);
    expect(transitionBody?.indexOf("setSession(nextSession)")).toBeGreaterThanOrEqual(0);
    expect(transitionBody?.indexOf("onBeforeAuthIdentityChange?.(")).toBeLessThan(
      transitionBody?.indexOf("setSession(nextSession)") ?? -1,
    );
  });
});

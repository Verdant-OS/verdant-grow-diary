import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");
const AUTH = readFileSync(resolve(ROOT, "src/store/auth.tsx"), "utf8");

describe("auth identity query-cache transition fence", () => {
  it("wires the root QueryClient clear into AuthProvider identity transitions", () => {
    expect(APP).toMatch(
      /function clearQueryCacheBeforeAuthIdentityChange\(\)[\s\S]{0,400}queryClient\.clear\(\)/,
    );
    expect(APP).toMatch(
      /<AuthProvider\s+onBeforeAuthIdentityChange=\{clearQueryCacheBeforeAuthIdentityChange\}>/,
    );
    expect(APP).toMatch(
      /function clearQueryCacheBeforeAuthIdentityChange\(\)[\s\S]{0,500}clearGrowDataMeta\(\)/,
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

/**
 * Static safety test: confirms analytics code does not reference
 * sensitive concepts, tokens, or data surfaces.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ANALYTICS_FILES = [
  "src/constants/analytics.ts",
  "src/hooks/useGoogleAnalyticsPageViews.ts",
  "src/lib/analyticsPageViewRules.ts",
  "src/routes/__root.tsx",
];

const FORBIDDEN_PATTERNS = [
  "service_role",
  "bridge_token",
  "raw_payload",
  "sensor_readings",
  "action_queue",
  "alerts insert",
  "alerts update",
  "alerts delete",
  // Note: a previous "ai " substring guard was removed because it false-positives
  // on legitimate prose like "Supabase / AI /" in route grouping comments inside
  // the root route. The narrower analytics-specific patterns below (plus the PII
  // guards in the second describe block) still prevent analytics code from
  // referencing product data surfaces.

  "device control",
  "insert ",
  "update ",
  "delete ",
  "upsert",
  "rpc ",
];

function readFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf-8");
}

describe("Google Analytics static safety — no sensitive references", () => {
  ANALYTICS_FILES.forEach((filePath) => {
    describe(filePath, () => {
      const content = readFile(filePath);

      FORBIDDEN_PATTERNS.forEach((pattern) => {
        it(`does not reference "${pattern.trim()}"`, () => {
          const lower = content.toLowerCase();
          expect(lower).not.toContain(pattern.toLowerCase());
        });
      });
    });
  });
});

describe("Google Analytics static safety — no PII in path logic", () => {
  it("sanitizePagePath does not import user-facing data helpers", () => {
    const content = readFile("src/hooks/useGoogleAnalyticsPageViews.ts");
    expect(content).not.toContain("user_id");
    expect(content).not.toContain("growId");
    expect(content).not.toContain("tentId");
    expect(content).not.toContain("plantId");
    expect(content).not.toContain("auth.uid");
  });

  it("never forwards React Router search params or relies on GA's raw-location fallback", () => {
    const hook = readFile("src/hooks/useGoogleAnalyticsPageViews.ts");
    const rootRoute = readFile("src/routes/__root.tsx");
    expect(hook).not.toContain("location.search");
    expect(hook).toContain("page_location:");
    expect(hook).toContain("buildSafeAnalyticsPageLocation");
    expect(rootRoute).toMatch(/send_page_view:\s*false/);
  });
});

describe("Google Analytics route metadata timing", () => {
  it("mounts analytics after the route outlet inside Suspense", () => {
    const rootRoute = readFile("src/routes/__root.tsx");
    const suspenseStart = rootRoute.indexOf("<Suspense");
    const outlet = rootRoute.indexOf("<Outlet />", suspenseStart);
    const analyticsMount = rootRoute.indexOf("<AnalyticsShell />", suspenseStart);
    const suspenseEnd = rootRoute.indexOf("</Suspense>", suspenseStart);

    expect(suspenseStart).toBeGreaterThanOrEqual(0);
    expect(outlet).toBeGreaterThan(suspenseStart);
    expect(analyticsMount).toBeGreaterThan(outlet);
    expect(analyticsMount).toBeLessThan(suspenseEnd);
    expect(rootRoute.match(/<AnalyticsShell \/>/g)).toHaveLength(1);
  });
});

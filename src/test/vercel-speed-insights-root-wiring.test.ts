import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT_ROUTE = readFileSync(resolve(__dirname, "../routes/__root.tsx"), "utf8");

function sliceFunction(name: string, until?: string): string {
  const start = ROOT_ROUTE.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = until !== undefined ? ROOT_ROUTE.indexOf(until, start) : ROOT_ROUTE.length;
  expect(end).toBeGreaterThan(start);
  return ROOT_ROUTE.slice(start, end);
}

describe("Vercel Speed Insights · root wiring", () => {
  const applicationRoot = () => sliceFunction("ApplicationRootComponent");
  const rootComponent = () => sliceFunction("RootComponent", "function ApplicationRootComponent");

  it("imports SpeedInsights from the React entry of @vercel/speed-insights", () => {
    expect(ROOT_ROUTE).toMatch(
      /import\s*\{\s*SpeedInsights\s*\}\s*from\s*["']@vercel\/speed-insights\/react["']/,
    );
  });

  it("mounts SpeedInsights in the main application shell", () => {
    expect(applicationRoot()).toContain("<SpeedInsights />");
  });

  it("keeps SpeedInsights inside QueryClientProvider so it spans the authenticated app tree", () => {
    expect(applicationRoot()).toMatch(
      /<QueryClientProvider[\s\S]*<SpeedInsights \/>[\s\S]*<\/QueryClientProvider>/,
    );
  });

  it("mounts SpeedInsights outside AuthProvider so auth transitions do not unmount perf collection", () => {
    const appRoot = applicationRoot();
    const authCloseIdx = appRoot.lastIndexOf("</AuthProvider>");
    const speedIdx = appRoot.indexOf("<SpeedInsights />");
    expect(authCloseIdx).toBeGreaterThan(-1);
    expect(speedIdx).toBeGreaterThan(-1);
    expect(authCloseIdx).toBeLessThan(speedIdx);
  });

  it("mounts SpeedInsights outside Suspense so route loading does not defer perf beacons", () => {
    const appRoot = applicationRoot();
    const suspenseCloseIdx = appRoot.lastIndexOf("</Suspense>");
    const speedIdx = appRoot.indexOf("<SpeedInsights />");
    expect(suspenseCloseIdx).toBeGreaterThan(-1);
    expect(speedIdx).toBeGreaterThan(-1);
    expect(suspenseCloseIdx).toBeLessThan(speedIdx);
  });

  it("does not mount SpeedInsights on the grow-help-toolkit-only root branch", () => {
    expect(rootComponent()).not.toContain("<SpeedInsights />");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import { breedingLogNewPath } from "@/lib/routes";
import {
  extractMountedAppRoutePaths,
  readAllRouteModuleSources,
} from "./helpers/routeManifestSyncHarness";

const ROOT = resolve(__dirname, "../..");
const APP_SOURCE = readAllRouteModuleSources();
const BUTTON_SOURCE = readFileSync(
  resolve(ROOT, "src/components/StartBreedingLogButton.tsx"),
  "utf8",
);

describe("breeding canonical routes", () => {
  it("keeps program creation and event logging mounted at distinct App routes", () => {
    expect(extractMountedAppRoutePaths()).toContain("/breeding/new");
    expect(extractMountedAppRoutePaths()).toContain("/breeding/log/new");
    // Exact un-nested ids (see authenticated-detail-route-unnesting.test.ts) —
    // the old regex alternation matched neither the broken nested form nor
    // the fixed `breeding_.` files reliably.
    expect(APP_SOURCE).toContain('createFileRoute("/_app/breeding_/new")');
    expect(APP_SOURCE).toContain('createFileRoute("/_app/breeding_/log/new")');
  });

  it("describes both canonical routes independently in the route manifest", () => {
    expect(APP_ROUTES.find((route) => route.path === "/breeding/new")).toMatchObject({
      access: "auth",
      description: "Create a new breeding program.",
    });
    expect(APP_ROUTES.find((route) => route.path === "/breeding/log/new")).toMatchObject({
      access: "auth",
      description: "Log a grow-scoped breeding event.",
    });
  });

  it("routes the authenticated logging CTA to the event page and preserves encoded scope", () => {
    const href = breedingLogNewPath("grow / 1", "tent?2");
    expect(href.startsWith("/breeding/log/new")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1] ?? "");
    expect(params.get("growId")).toBe("grow / 1");
    expect(params.get("tentId")).toBe("tent?2");
  });

  it("builds the logging destination through the shared route helper", () => {
    expect(BUTTON_SOURCE).toMatch(
      /import\s+\{\s*breedingLogNewPath\s*\}\s+from\s+"@\/lib\/routes"/,
    );
    expect(BUTTON_SOURCE).toMatch(/const href = breedingLogNewPath\(growId,\s*tentId\)/);
  });
});

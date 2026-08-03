/**
 * Today Trust + Route Polish v1 — /ai-doctor redirect alias.
 *
 * Growers sometimes type /ai-doctor; canonical route is /doctor.
 * Static scan verifies the alias is mounted as a redirect and that the
 * manifest records it as a redirect entry.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  extractMountedAppRoutePaths,
  readAllRouteModuleSources,
  getRouteAliasRedirectTarget,
} from "./helpers/routeManifestSyncHarness";

const APP_TSX = readAllRouteModuleSources();

describe("/ai-doctor redirect alias", () => {
  it("File routes mount /ai-doctor through the context-preserving alias", () => {
    expect(extractMountedAppRoutePaths()).toContain("/ai-doctor");
    expect(getRouteAliasRedirectTarget("/ai-doctor")).toBe("/doctor");
  });

  it("file routes still mount canonical /doctor route", () => {
    expect(extractMountedAppRoutePaths()).toContain("/doctor");
    expect(APP_TSX).toMatch(/AiDoctorStart|@\/pages\/AiDoctorStart|pages\/AiDoctorStart/);
  });

  it("appRouteManifest records /ai-doctor as redirect", () => {
    const entry = APP_ROUTES.find((r) => r.path === "/ai-doctor");
    expect(entry).toBeDefined();
    expect(entry?.access).toBe("redirect");
  });

  it("canonical /doctor manifest entry remains auth-gated", () => {
    const entry = APP_ROUTES.find((r) => r.path === "/doctor");
    expect(entry?.access).toBe("auth");
  });
});
